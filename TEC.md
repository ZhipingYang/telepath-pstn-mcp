# TelePath MCP Server - 技术文档

通过 AI 控制 TelePath 电话测试工具 - 支持拨打、挂断、查询通话状态。

---

## 📋 目录

- [概述](#概述)
- [系统架构](#系统架构)
- [REST API 文档](#rest-api-文档)
- [MCP 工具](#mcp-工具)

---

## 概述

**TelePath URL**: `https://telepath.int.rclabenv.com`

### 核心架构

TelePath 采用 **混合架构**:
- **REST API**: 用于数据查询和记录（电话列表、通话历史）
- **WebRTC/SIP.js**: 用于实际呼叫控制（通过浏览器实现）

> ⚠️ **重要**: REST API **不能** 发起真正的呼叫，只能记录通话数据。真正的呼叫必须通过浏览器中的 sip.js + WebRTC 实现。

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Client (Claude/AI)                   │
└────────────────────────────┬────────────────────────────────┘
                             │ MCP Protocol
┌────────────────────────────▼────────────────────────────────┐
│                  telepath-mcp-server.js                     │
│  ┌──────────────────┐  ┌──────────────────────────────┐    │
│  │ REST API Client  │  │ Puppeteer Browser Service    │    │
│  │ (查询/记录)       │  │ (实际呼叫控制)               │    │
│  └────────┬─────────┘  └──────────────┬───────────────┘    │
└───────────┼───────────────────────────┼─────────────────────┘
            │                           │
┌───────────▼───────────┐  ┌────────────▼────────────────────┐
│  TelePath REST API    │  │  Headless Chrome + sip.js       │
│  (Express Backend)    │  │  (WebRTC 呼叫)                   │
└───────────────────────┘  └──────────────┬──────────────────┘
                                          │ SIP/RTP
                           ┌──────────────▼──────────────────┐
                           │         SIP Server              │
                           │  (siptel-*.int.rclabenv.com)    │
                           └─────────────────────────────────┘
```

---

## REST API 文档

### 认证

所有 API 请求需要在 Header 中携带 JWT Token:

```
x-access-token: <JWT_TOKEN>
```

---

### 1. 登录

**POST** `/api/auth/signin`

**Request Body:**
```json
{
  "username": "daniel.yang",
  "password": "your_password"
}
```

**Response (201):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": "68b943161be9734fa53dfc68",
  "username": "daniel.yang",
  "isAdmin": false
}
```

**JWT Token 结构:**
```json
{
  "username": "daniel.yang",
  "user_id": "68b943161be9734fa53dfc68",
  "isAdmin": false,
  "iat": 1767578655
}
```

---

### 2. 获取用户信息

**GET** `/api/users/{userId}`

**Response (200):**
```json
{
  "_id": "68b943161be9734fa53dfc68",
  "username": "daniel.yang",
  "isAdmin": false,
  "favoriteEnvironments": [],
  "darkTheme": false,
  "revision": 0.6,
  "lastLogin": "2025-12-30T09:43:35.126Z",
  "audioVolume": 50,
  "ringerMuted": true
}
```

---

### 3. 获取 Phone Boards

**GET** `/api/users/{userId}/phoneBoards`

**Response (200):**
```json
[
  {
    "_id": "68b9432a1be9734fa53dfc7b",
    "label": "GLP-MOB-MXN",
    "columnsCount": 2,
    "user": "68b943161be9734fa53dfc68",
    "audioVolume": 50,
    "ringerMuted": true
  },
  {
    "_id": "68b945331be9734fa53dfeef",
    "label": "XMN-UP",
    "columnsCount": 2,
    "user": "68b943161be9734fa53dfc68",
    "audioVolume": 50,
    "ringerMuted": true
  }
]
```

---

### 4. 获取电话列表

**GET** `/api/users/{userId}/phoneBoards/{boardId}/phones`

**Response (200):**
```json
[
  {
    "_id": "695364493e9225280762f0b0",
    "user": "68b943161be9734fa53dfc68",
    "board": "68b945331be9734fa53dfeef",
    "label": "New Phone",
    "column": 0,
    "rank": 0,
    "color": "#ff7300",
    "envName": "XMR-UP-XMN",
    "rcIds": {
      "accountId": "",
      "extensionId": ""
    },
    "configType": "manual",
    "sipAccounts": [
      {
        "label": "trunk: rc",
        "username": "+12098889406",
        "domain": "siptel-xmrupxmn.int.rclabenv.com",
        "outboundProxy": "",
        "authId": "",
        "password": "",
        "bca": {
          "numAppearances": 0,
          "extensionId": "",
          "ringDelay": 0
        }
      }
    ],
    "phoneLines": [],
    "phoneFeatures": {
      "isEnabledDnd": false,
      "showPai": false,
      "isEnabled183Response": false,
      "holdOnTransfer": true
    },
    "codecs": {
      "enabled": [
        {"code": 111, "name": "OPUS"},
        {"code": 63, "name": "RED"},
        {"code": 9, "name": "G722"},
        {"code": 0, "name": "PCMU"},
        {"code": 8, "name": "PCMA"}
      ]
    }
  }
]
```

**关键字段说明:**

| 字段 | 说明 |
|------|------|
| `_id` | 电话唯一标识 |
| `sipAccounts[0].username` | SIP 用户名（电话号码） |
| `sipAccounts[0].domain` | SIP 服务器域名 |
| `envName` | 环境名称 |
| `codecs.enabled` | 启用的音频编码 |

---

### 5. 获取通话记录

**GET** `/api/users/{userId}/phoneBoards/{boardId}/phones/{phoneId}/phoneCalls?offset=0&limit=20`

**Response (200):**
```json
{
  "count": 7,
  "offset": 0,
  "calls": [
    {
      "_id": "695399e43e92252807630ad0",
      "user": "68b943161be9734fa53dfc68",
      "phone": "695364493e9225280762f0b0",
      "board": "68b945331be9734fa53dfeef",
      "startDate": "2025-12-30T09:22:44.634Z",
      "endDate": "2025-12-30T09:26:09.407Z",
      "localPhoneNumber": "+12098889406",
      "localDisplaName": "New Phone",
      "remotePhoneNumber": "+12128881843",
      "remoteDisplayName": "",
      "inbound": false
    }
  ]
}
```

---

### 6. 创建通话记录

**POST** `/api/users/{userId}/phoneBoards/{boardId}/phoneCalls`

> ⚠️ 此 API 仅**记录**通话数据，不会发起真正的呼叫

**Request Body:**
```json
{
  "user": "68b943161be9734fa53dfc68",
  "phone": "695364493e9225280762f0b0",
  "board": "68b945331be9734fa53dfeef",
  "startDate": "2026-01-05T02:05:08.787Z",
  "endDate": "2026-01-05T02:05:08.648Z",
  "inbound": false,
  "localPhoneNumber": "+12098889406",
  "localDisplaName": "New Phone",
  "remotePhoneNumber": "+12098883168",
  "remoteDisplayName": ""
}
```

**Response (201):**
```json
{
  "id": "695b1c553e92252807638203"
}
```

---

### 7. 更新通话记录

**PUT** `/api/users/{userId}/phoneBoards/{boardId}/phoneCalls/{callId}`

**Request Body:**
```json
{
  "user": "68b943161be9734fa53dfc68",
  "phone": "695364493e9225280762f0b0",
  "board": "68b945331be9734fa53dfeef",
  "startDate": "2026-01-05T02:05:08.787Z",
  "endDate": "2026-01-05T02:05:37.500Z",
  "inbound": false,
  "localPhoneNumber": "+12098889406",
  "localDisplaName": "New Phone",
  "remotePhoneNumber": "+12098883168",
  "remoteDisplayName": "",
  "_id": "695b1c553e92252807638203"
}
```

**Response (200):** 空响应

---

### 8. 获取环境列表

**GET** `/api/environments`

**Response (200):**
```json
[
  {
    "_id": "6920270c64912f239837d16c",
    "name": "AI-DEM-AMS",
    "adbConnectionString": "(DESCRIPTION=...)",
    "ags2Address": "http://aid01-t01-ags01.int.rclabenv.com:8081/ag/",
    "intapiAddress": "http://intapi-aidemams.int.rclabenv.com",
    "vpeDomain": "siptel-aidemams.int.rclabenv.com",
    "scpAddress": "https://scp-aidemams.int.rclabenv.com"
  }
]
```

---

### API 端点汇总

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/auth/signin` | 登录获取 Token |
| GET | `/api/users/{userId}` | 获取用户信息 |
| GET | `/api/users/{userId}/phoneBoards` | 获取 Phone Boards |
| GET | `/api/users/{userId}/phoneBoards/{boardId}/phones` | 获取电话列表 |
| GET | `/api/users/{userId}/phoneBoards/{boardId}/phones/{phoneId}/phoneCalls` | 获取通话记录 |
| POST | `/api/users/{userId}/phoneBoards/{boardId}/phoneCalls` | 创建通话记录 |
| PUT | `/api/users/{userId}/phoneBoards/{boardId}/phoneCalls/{callId}` | 更新通话记录 |
| GET | `/api/environments` | 获取环境列表 |

## MCP 工具

### 工具列表

**混合架构**: REST API (快速查询) + Puppeteer (WebRTC 操作)

| 工具 | 方式 | 说明 |
|------|------|------|
| `telepath_make_call` | Puppeteer | 📞 发起呼叫 (自动启动浏览器) |
| `telepath_hangup` | Puppeteer | 📴 挂断当前通话 |
| `telepath_list_phones` | REST API + Puppeteer | 📱 获取电话列表和实时状态 |
| `telepath_call_status` | Puppeteer | 📊 获取当前通话状态 |
| `telepath_stop_browser` | Puppeteer | 🛑 停止浏览器服务 |

### 使用流程

```
1. 拨打电话
   telepath_make_call(fromNumber: "+12098889406", toNumber: "+12128881843")
   → 自动启动浏览器 → 登录 → 拨打

2. 查看状态
   telepath_list_phones()
   → 返回所有电话及实时状态 (idle/in_call/ringing)

3. 挂断
   telepath_hangup()
   → 结束当前通话

4. 清理资源
   telepath_stop_browser()
   → 关闭浏览器进程
```

### 使用示例

**示例 1: 拨打电话**
```
用户: 请拨打 +1 (212) 888-1843
AI:   调用 telepath_make_call(fromNumber="+12098889406", toNumber="+12128881843")
      → 📞 呼叫: +12098889406 -> +12128881843
```

**示例 2: 查看可用电话**
```
用户: 我有几个号码？
AI:   调用 telepath_list_phones()
      → 📱 电话列表:
        +12098889406 (idle, 可接听)
        +12098883168 (idle, 可接听)
        +12098881898 (in_call, 通话中)
```

### 为什么使用 Puppeteer?

TelePath 前端使用 **sip.js** + **WebRTC** 实现呼叫功能，REST API 无法直接控制呼叫。

**Puppeteer 方案优势:**
- ✅ 复用 TelePath 现有的 SIP/WebRTC 逻辑
- ✅ 无需处理复杂的 SIP 凭据获取
- ✅ 稳定可靠，与用户手动操作相同
- ✅ 支持无头模式运行

---

## 环境变量配置

### 必需变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `TELEPATH_USERNAME` | TelePath 用户名 | `daniel.yang` |
| `TELEPATH_PASSWORD` | TelePath 密码 | `your_password` |

### 可选变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TELEPATH_URL` | TelePath 服务地址 | `https://telepath.int.rclabenv.com` |
| `TELEPATH_USER_ID` | 用户 ID | 自动获取 |
| `TELEPATH_BOARD_ID` | Phone Board ID | 自动获取 |
| `TELEPATH_ENV_NAME` | 环境名称 | `XMR-UP-XMN` |

### MCP 配置示例

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

---

## 错误排查指南

### 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `缺少必需环境变量` | 未配置用户名/密码 | 在 MCP 配置中添加 env |
| `登录失败: HTTP 401` | 用户名或密码错误 | 检查凭据是否正确 |
| `电话注册超时` | 网络慢或 SIP 服务器问题 | 重试或检查网络 |
| `未找到电话号码` | Phone Board 中没有该号码 | 检查 fromNumber 是否正确 |
| `浏览器未启动` | 调用 hangup 前未拨打电话 | 先调用 make_call |

### 调试步骤

1. **检查环境变量**
   ```bash
   echo $TELEPATH_USERNAME
   echo $TELEPATH_PASSWORD
   ```

2. **测试 API 连接**
   ```bash
   curl -X POST https://telepath.int.rclabenv.com/api/auth/signin \
     -H "Content-Type: application/json" \
     -d '{"username":"your_user","password":"your_pass"}'
   ```

3. **查看 MCP 日志**
   - Cursor: `~/.cursor/logs/`
   - Claude Desktop: `~/Library/Logs/Claude/`

---

## 项目文件

| 文件 | 说明 |
|------|------|
| `telepath-mcp-server.js` | MCP 服务器主入口 |
| `telepath-browser-service.js` | Puppeteer 浏览器控制服务 |
| `TEC.md` | 技术文档 |
| `README.md` | 快速开始指南 |

---

## 性能优化建议

1. **减少浏览器启动次数**
   - `telepath_make_call` 会自动启动浏览器并保持运行
   - 只在完成所有通话后调用 `telepath_stop_browser`

2. **使用无头模式**
   - 默认使用无头模式，减少资源占用
   - 需要调试时可以使用有界面模式

3. **缓存电话列表**
   - MCP 服务会缓存电话列表
   - 只在需要实时状态时调用 `telepath_list_phones`

---

## 注意事项

1. **安全**: 凭据通过环境变量传递，不存储在代码中
2. **Token 有效期**: JWT Token 可能会过期，服务会自动重新登录
3. **SIP 域名**: 不同环境使用不同的 SIP 域名
4. **WebRTC 限制**: 呼叫功能需要 Chrome 浏览器支持

