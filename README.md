# TelePath PSTN MCP

通过 AI 助手控制 TelePath 进行 PSTN 电话呼叫。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 MCP

在 Cursor 或 Claude Desktop 的 MCP 配置中添加:

```json
{
  "mcpServers": {
    "telepath": {
      "command": "node",
      "args": ["/path/to/telepath-mcp-server.js"],
      "env": {
        "TELEPATH_USERNAME": "your_username",
        "TELEPATH_PASSWORD": "your_password"
      }
    }
  }
}
```

### 3. 使用

在 AI 对话中直接说:

- "拨打 +1 (212) 888-1843"
- "我有哪些可用的电话号码？"
- "新增一个电话号码"
- "挂断电话"

## 可用工具

| 工具 | 说明 |
|------|------|
| `telepath_make_call` | 📞 拨打电话 |
| `telepath_hangup` | 📴 挂断通话 |
| `telepath_list_phones` | 📱 查看电话列表 |
| `telepath_call_status` | 📊 查看通话状态 |
| `telepath_add_phone` | ➕ 新增电话号码 |
| `telepath_delete_phone` | 🗑️ 删除电话号码 |
| `telepath_stop_browser` | 🛑 停止服务 |

## 限制

- ⚠️ 同一 Board 最多同时注册 **3 个电话号码**
- 电话号码格式: `+1209888xxxx` (随机生成)
- 推荐环境: `XMR-UP-XMN`

## 文档

详细技术文档请参阅 [TEC.md](./TEC.md)

## 环境要求

- Node.js 18+
- Chrome 浏览器 (Puppeteer 自动下载)
- TelePath 账号

## 测试结果 (2026-01-05)

✅ 通过 API 创建随机号码可正常注册和拨打
✅ 成功拨打真实外部号码 (+12128881843)
✅ 删除电话 API 工作正常

## 许可证

MIT

