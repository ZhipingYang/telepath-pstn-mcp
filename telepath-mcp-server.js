#!/usr/bin/env node
/**
 * TelePath MCP Server
 *
 * 通过 AI 控制 TelePath 电话测试工具 - 支持拨打、挂断、查询通话状态。
 *
 * 架构:
 * - REST API: 快速查询 (电话列表、通话状态)
 * - Puppeteer: WebRTC 操作 (拨打、挂断)
 *
 * 环境变量 (必需):
 * - TELEPATH_USERNAME: 用户名
 * - TELEPATH_PASSWORD: 密码
 *
 * 环境变量 (可选):
 * - TELEPATH_URL: TelePath 服务地址 (默认 https://telepath.int.rclabenv.com)
 * - TELEPATH_USER_ID: 用户 ID (自动获取)
 * - TELEPATH_BOARD_ID: Phone Board ID (自动获取)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ============ 常量定义 ============
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TELEPATH_URL = process.env.TELEPATH_URL || 'https://telepath.int.rclabenv.com';

// ============ 动态导入 ============
const { default: TelepathBrowserService } = await import(join(__dirname, 'telepath-browser-service.js'));

// ============ 全局状态 ============
let service = null;
let browserStarted = false;
let cachedPhones = [];

// ============ 辅助函数 ============

/**
 * 检查环境变量配置是否完整
 */
function checkConfig() {
  return !!(process.env.TELEPATH_USERNAME && process.env.TELEPATH_PASSWORD);
}

/**
 * 格式化电话列表 (统一格式化逻辑)
 */
function formatPhones(phones) {
  return phones.map(p => ({
    id: p._id,
    number: p.sipAccounts?.[0]?.username || 'N/A',
    label: p.label,
    trunk: p.sipAccounts?.[0]?.label || 'unknown'
  }));
}

/**
 * 创建成功响应
 */
function successResponse(text) {
  return { content: [{ type: 'text', text }] };
}

/**
 * 创建错误响应
 */
function errorResponse(message, details = null) {
  const text = details ? `❌ ${message}: ${details}` : `❌ ${message}`;
  return { content: [{ type: 'text', text }] };
}

// 创建 MCP 服务器
const server = new Server(
  {
    name: 'telepath-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {
        listChanged: true,  // 支持动态工具列表变更通知
      },
    },
  }
);

// 通知客户端工具列表已变更
async function notifyToolsChanged() {
  try {
    await server.notification({ method: 'notifications/tools/list_changed' });
  } catch (e) {
    // 忽略通知失败（客户端可能不支持）
  }
}

// 动态生成工具列表
function getTools() {
  const configured = checkConfig();

  // 未配置状态：只返回配置提示
  if (!configured) {
    return [{
      name: 'telepath_setup_help',
      description: `⚠️ TelePath 未配置。请设置环境变量：
- TELEPATH_USERNAME: 你的用户名
- TELEPATH_PASSWORD: 你的密码

配置方式：
1. 在 MCP 配置中添加 env
2. 或在 shell 中 export 环境变量`,
      inputSchema: { type: 'object', properties: {} }
    }];
  }

  // 始终返回完整工具集，make_call 会自动启动浏览器
  const phoneListDesc = cachedPhones.length > 0
    ? `可用: ${cachedPhones.map(p => p.number).join(', ')}`
    : '调用后自动获取可用号码';

  const browserStatus = browserStarted ? '✅' : '⏸️';

  return [
    {
      name: 'telepath_make_call',
      description: `📞 拨打电话 (${phoneListDesc})
⚠️ 调用前必须:
1. 先调用 list_phones 检查是否有号码，若无则询问用户是否添加
2. 确认 fromNumber 的 status 为 idle 才能拨打
3. 若 status 为 in_call/ringing/registering 则不可用`,
      inputSchema: {
        type: 'object',
        properties: {
          fromNumber: { type: 'string', description: '主叫号码 (必须是 status=idle 的号码)' },
          toNumber: { type: 'string', description: '被叫号码 (如 +12128881843)' }
        },
        required: ['fromNumber', 'toNumber']
      }
    },
    {
      name: 'telepath_hangup',
      description: '📴 挂断当前通话',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'telepath_list_phones',
      description: `📱 获取电话列表和状态 ${browserStatus}
⚠️ 拨打电话前必须先调用此接口:
- 检查是否有可用号码 (若无则询问用户是否添加)
- 确认号码 status=idle 才可拨打`,
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'telepath_call_status',
      description: '📊 获取所有号码的当前状态 (idle/in_call/ringing/registering)',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'telepath_add_phone',
      description: '➕ 新增电话号码 (PSTN)',
      inputSchema: {
        type: 'object',
        properties: {
          phoneNumber: { type: 'string', description: '电话号码 (可选，默认自动生成 +1209888xxxx)' },
          label: { type: 'string', description: '电话标签 (可选，默认 "New Phone")' },
          envName: { type: 'string', description: '环境名称 (可选，默认 "XMR-UP-XMN"，必须用此环境才能注册成功)' },
          trunk: { type: 'string', description: 'Trunk 类型 (可选，默认 "rc")' }
        },
        required: []
      }
    },
    {
      name: 'telepath_delete_phone',
      description: '🗑️ 删除电话号码',
      inputSchema: {
        type: 'object',
        properties: {
          phoneId: { type: 'string', description: '电话 ID (必须)' }
        },
        required: ['phoneId']
      }
    },
    {
      name: 'telepath_stop_browser',
      description: '🛑 停止浏览器服务',
      inputSchema: { type: 'object', properties: {} }
    }
  ];
}

// 处理工具列表请求 - 动态返回
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: getTools() };
});

// 处理工具调用请求
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // 确保服务实例存在
  if (!service) {
    service = new TelepathBrowserService(TELEPATH_URL);
  }

  try {
    switch (name) {
      // ===== 配置帮助 =====
      case 'telepath_setup_help': {
        return { content: [{ type: 'text', text: `
⚠️ TelePath MCP 需要配置

请在 Augment MCP 配置中添加环境变量:

{
  "mcpServers": {
    "telepath": {
      "command": "npx",
      "args": ["telepath-pstn-mcp"],
      "env": {
        "TELEPATH_USERNAME": "your-username",
        "TELEPATH_PASSWORD": "your-password"
      }
    }
  }
}

配置完成后请重启 VS Code。
` }] };
      }

      // ===== REST API 工具 =====
      case 'telepath_list_phones': {
        const phones = await service.apiGetPhones();
        const formatted = formatPhones(phones);
        cachedPhones = formatted;

        // 如果浏览器已启动，获取实时状态
        let statusInfo = '';
        if (browserStarted) {
          try {
            const liveStatuses = await service.getPhoneStatuses();
            const statusMap = Object.fromEntries(liveStatuses.map(s => [s.number, s]));

            // 合并实时状态到列表
            formatted.forEach(p => {
              const live = statusMap[p.number];
              if (live) {
                p.status = live.status;
                p.canReceiveCall = live.canReceiveCall;
              }
            });

            const idlePhones = formatted.filter(p => p.canReceiveCall);
            const busyPhones = formatted.filter(p => !p.canReceiveCall && p.status);
            const unregisteredPhones = formatted.filter(p => !p.status);

            statusInfo = `\n\n📊 实时状态:\n`;
            statusInfo += `  🟢 闲置可接听: ${idlePhones.map(p => p.number).join(', ') || '无'}\n`;
            statusInfo += `  🔴 忙线中: ${busyPhones.map(p => `${p.number}(${p.status})`).join(', ') || '无'}`;
            if (unregisteredPhones.length > 0) {
              statusInfo += `\n  ⏳ 未注册: ${unregisteredPhones.map(p => p.number).join(', ')}`;
              statusInfo += '\n  💡 提示: 新号码需要等待注册完成，可尝试停止浏览器后重新获取';
            }
          } catch {
            statusInfo = '\n\n⚠️ 无法获取实时状态';
          }
        }

        const actionText = browserStarted
          ? '✅ 浏览器已启动，可以拨打/接听电话'
          : '💡 拨打电话时会自动启动浏览器';

        return successResponse(`📱 电话列表:\n${JSON.stringify(formatted, null, 2)}${statusInfo}\n\n${actionText}`);
      }

      // ===== Puppeteer 工具 =====
      case 'telepath_start_browser': {
        if (browserStarted) {
          const phoneInfo = cachedPhones.length > 0
            ? `可用电话: ${cachedPhones.map(p => p.number).join(', ')}`
            : '调用 telepath_list_phones 获取电话列表';
          return successResponse(`浏览器已在运行\n${phoneInfo}`);
        }
        await service.start(args?.headless ?? true);
        browserStarted = true;
        await notifyToolsChanged();

        // 启动后自动获取电话列表
        try {
          const phones = await service.apiGetPhones();
          cachedPhones = formatPhones(phones);
          const phoneList = cachedPhones.map(p => `  - ${p.number} (${p.label})`).join('\n');
          return successResponse(`✅ 浏览器已启动\n\n📱 可用电话:\n${phoneList}`);
        } catch {
          return successResponse('✅ 浏览器已启动，调用 telepath_list_phones 获取电话列表');
        }
      }

      case 'telepath_make_call': {
        // 自动启动浏览器
        if (!browserStarted) {
          await service.start(true);
          browserStarted = true;
          await notifyToolsChanged();
        }
        const result = await service.makeCall(args.fromNumber, args.toNumber);
        return successResponse(`📞 呼叫: ${args.fromNumber} -> ${args.toNumber}\n${JSON.stringify(result)}`);
      }

      case 'telepath_hangup': {
        if (!browserStarted) {
          return errorResponse('浏览器未启动，无活动通话');
        }
        const result = await service.hangup();
        return successResponse(`📴 挂断: ${JSON.stringify(result)}`);
      }

      case 'telepath_call_status': {
        if (!browserStarted) {
          return successResponse('💤 浏览器未启动，无法获取实时状态。请先拨打电话或调用 list_phones 查看号码列表');
        }
        const statuses = await service.getPhoneStatuses();

        // 格式化输出
        const idle = statuses.filter(s => s.status === 'idle').map(s => s.number);
        const busy = statuses.filter(s => s.status !== 'idle').map(s => `${s.number}(${s.status})`);

        let summary = '📊 所有号码状态:\n';
        summary += `  🟢 闲置可用: ${idle.length > 0 ? idle.join(', ') : '无'}\n`;
        summary += `  🔴 忙线中: ${busy.length > 0 ? busy.join(', ') : '无'}`;

        return successResponse(summary);
      }

      case 'telepath_add_phone': {
        const result = await service.apiAddPhone({
          phoneNumber: args.phoneNumber,
          label: args.label,
          envName: args.envName,
          trunk: args.trunk
        });

        // 如果浏览器被重启了，更新状态
        if (result.needsRestart) {
          browserStarted = false;
          await notifyToolsChanged();
        }

        // 更新缓存的电话列表
        try {
          const phones = await service.apiGetPhones();
          cachedPhones = formatPhones(phones);
        } catch {
          // 忽略刷新失败
        }

        // 构建返回消息
        const info = {
          id: result.id,
          phoneNumber: result.phoneNumber,
          label: result.label,
          envName: result.envName,
          trunk: result.trunk
        };

        let message = `➕ 新增电话成功!\n${JSON.stringify(info, null, 2)}`;
        if (result.message) {
          message += `\n\n${result.message}`;
        }
        message += '\n\n💡 提示: 新号码需要等待浏览器启动并进入 Board 后完成注册才能使用';

        return successResponse(message);
      }

      case 'telepath_delete_phone': {
        const result = await service.apiDeletePhone(args.phoneId);

        // 更新缓存的电话列表
        try {
          const phones = await service.apiGetPhones();
          cachedPhones = formatPhones(phones);
        } catch {
          // 忽略刷新失败
        }

        return successResponse(`🗑️ 删除电话成功!\n${JSON.stringify(result, null, 2)}`);
      }

      case 'telepath_stop_browser': {
        if (service && browserStarted) {
          await service.stop();
          browserStarted = false;
          await notifyToolsChanged();
        }
        return successResponse('🛑 浏览器已停止');
      }

      default:
        return errorResponse(`未知工具: ${name}`);
    }
  } catch (error) {
    const details = error.stack ? `${error.message}\n${error.stack}` : error.message;
    return errorResponse('执行失败', details);
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('TelePath MCP Server 已启动');
}

main().catch(console.error);

