# TelePath MCP 自测用例

> 版本: 1.2.0
> 更新日期: 2025-01-05

## 📋 测试前准备

### 环境要求
- Node.js 18+
- MCP 配置正确（TELEPATH_USERNAME, TELEPATH_PASSWORD）
- 网络可访问 telepath.ringcentral.com

### 初始状态检查
```
✅ MCP 服务已启动
✅ 浏览器未启动 (browserStarted = false)
✅ 至少有 1 个电话号码
```

---

## 🔗 工具依赖关系

### 操作类型

| 类型 | 工具 | 需要浏览器？ |
|------|------|-------------|
| **REST API** | list_phones, add_phone, delete_phone | ❌ 不需要 |
| **Puppeteer** | make_call, hangup, call_status | ✅ 需要 |

### 工具前置条件

| 工具 | 前置条件 | 说明 |
|------|----------|------|
| `list_phones` | 无 | 🟢 随时可调用，返回号码列表和状态 |
| `add_phone` | 无 | 🟢 随时可调用，添加后浏览器会自动重启 |
| `delete_phone` | 需要有效 phoneId | 🟢 从 list_phones 获取 ID |
| `stop_browser` | 无 | 🟢 随时可调用 |
| `call_status` | 浏览器已启动 | 🟡 否则返回"浏览器未启动" |
| `hangup` | 浏览器已启动 + 有通话 | 🟡 否则返回错误 |
| `make_call` | 有号码 + status=idle | 🔴 最严格，需确认号码可用 |

### 标准拨打电话流程

```
1. list_phones      → 检查是否有号码
   ├─ 无号码 → 询问用户是否 add_phone
   └─ 有号码 → 继续

2. 检查 status 字段
   ├─ 浏览器未启动 → 无 status，任选一个号码尝试
   └─ 浏览器已启动 → 必须选择 status=idle 的号码

3. make_call        → 拨打电话（自动启动浏览器 + 等待注册）

4. hangup           → 结束通话
```

---

## 🧪 测试用例

> ⚠️ 每个工具都需要测试 **浏览器未启动** 和 **浏览器已启动** 两种状态

---

### 📱 list_phones

#### TC-01a: list_phones（浏览器未启动）

**预设**: `stop_browser` 确保浏览器未启动

**步骤**: 调用 `telepath_list_phones`

**预期结果**:
- ✅ 返回电话列表（从 REST API 获取）
- ✅ 无 status/canReceiveCall 字段
- ✅ 显示 "💡 拨打电话时会自动启动浏览器"

---

#### TC-01b: list_phones（浏览器已启动）

**预设**: `make_call` 确保浏览器已启动

**步骤**: 调用 `telepath_list_phones`

**预期结果**:
- ✅ 返回电话列表（含实时状态）
- ✅ 每个号码有 status: idle/in_call/ringing
- ✅ 每个号码有 canReceiveCall: true/false
- ✅ 显示 "📊 实时状态" 汇总
- ✅ 显示 "✅ 浏览器已启动，可以拨打/接听电话"

---

### 📊 call_status

#### TC-02a: call_status（浏览器未启动）

**预设**: `stop_browser` 确保浏览器未启动

**步骤**: 调用 `telepath_call_status`

**预期结果**:
- ✅ 返回 "💤 浏览器未启动，无法获取实时状态"

---

#### TC-02b: call_status（浏览器已启动）

**预设**: `make_call` 确保浏览器已启动

**步骤**: 调用 `telepath_call_status`

**预期结果**:
- ✅ 返回所有号码状态汇总
- ✅ 格式: `🟢 闲置可用: +1xxx` 和 `🔴 忙线中: +1xxx(in_call)`

---

### 📞 make_call

#### TC-03a: make_call（浏览器未启动）

**预设**: `stop_browser` 确保浏览器未启动

**步骤**: 调用 `telepath_make_call`

**预期结果**:
- ✅ 浏览器自动启动
- ✅ 等待所有号码注册完成
- ✅ 拨打成功，返回 `{"success": true}`

---

#### TC-03b: make_call（浏览器已启动，号码 idle）

**预设**: 先拨打再挂断，确保浏览器启动且号码 idle

**步骤**: 调用 `telepath_make_call`

**预期结果**:
- ✅ 直接拨打，无需等待注册
- ✅ 拨打成功，返回 `{"success": true}`

---

### 📴 hangup

#### TC-04a: hangup（浏览器未启动）

**预设**: `stop_browser` 确保浏览器未启动

**步骤**: 调用 `telepath_hangup`

**预期结果**:
- ✅ 返回错误 "浏览器未启动，无活动通话"

---

#### TC-04b: hangup（浏览器已启动，有通话）

**预设**: `make_call` 确保有通话进行中

**步骤**: 调用 `telepath_hangup`

**预期结果**:
- ✅ 挂断成功，返回 `{"success": true}`

---

### ➕ add_phone

#### TC-05a: add_phone（浏览器未启动）

**预设**: `stop_browser` 确保浏览器未启动

**步骤**: 调用 `telepath_add_phone`

**预期结果**:
- ✅ 新号码创建成功
- ✅ 返回新号码信息（id, phoneNumber, label, envName, trunk）
- ✅ 无"浏览器已重启"提示

---

#### TC-05b: add_phone（浏览器已启动）

**预设**: `make_call` + `hangup` 确保浏览器启动

**步骤**: 调用 `telepath_add_phone`

**预期结果**:
- ✅ 新号码创建成功
- ✅ 浏览器自动停止
- ✅ 返回消息包含 "⚠️ 新号码已创建，浏览器已重启"
- ✅ 再次 `list_phones` 显示 "💡 拨打电话时会自动启动浏览器"

---

### 🗑️ delete_phone

#### TC-06a: delete_phone（浏览器未启动）

**预设**: `stop_browser` 确保浏览器未启动

**步骤**: 调用 `telepath_delete_phone`（使用有效 phoneId）

**预期结果**:
- ✅ 删除成功，返回 `{"success": true}`

---

#### TC-06b: delete_phone（浏览器已启动）

**预设**: `make_call` + `hangup` 确保浏览器启动

**步骤**: 调用 `telepath_delete_phone`（使用有效 phoneId）

**预期结果**:
- ✅ 删除成功，返回 `{"success": true}`
- ✅ 浏览器保持运行（不受影响）

---

### 🛑 stop_browser

#### TC-07a: stop_browser（浏览器未启动）

**预设**: 确保浏览器未启动

**步骤**: 调用 `telepath_stop_browser`

**预期结果**:
- ✅ 返回 "� 浏览器已停止"（幂等操作）

---

#### TC-07b: stop_browser（浏览器已启动）

**预设**: `make_call` + `hangup` 确保浏览器启动

**步骤**: 调用 `telepath_stop_browser`

**预期结果**:
- ✅ 浏览器停止
- ✅ 返回 "🛑 浏览器已停止"

## 🔄 场景测试

### S-01: 完整通话流程

```
1. telepath_list_phones          → 查看可用号码
2. telepath_make_call            → 拨打电话（自动启动浏览器）
3. telepath_call_status          → 确认通话状态
4. telepath_list_phones          → 查看实时状态
5. telepath_hangup               → 挂断
6. telepath_list_phones          → 确认状态恢复
```

---

### S-02: 号码管理流程

```
1. telepath_list_phones          → 记录当前号码数量
2. telepath_add_phone            → 添加新号码
3. telepath_list_phones          → 确认新号码出现
4. telepath_make_call            → 用新号码拨打（验证注册）
5. telepath_hangup               → 挂断
6. telepath_delete_phone         → 删除号码
7. telepath_list_phones          → 确认号码已删除
```

---

### S-03: 浏览器重启后状态恢复

```
1. telepath_make_call            → 启动浏览器并拨打
2. telepath_hangup               → 挂断
3. telepath_stop_browser         → 停止浏览器
4. telepath_make_call            → 再次拨打（验证重新等待注册）
5. telepath_list_phones          → 确认所有号码状态正常
```

---

### S-04: 添加号码触发浏览器重启

```
1. telepath_make_call            → 启动浏览器
2. telepath_hangup               → 挂断
3. telepath_add_phone            → 添加新号码（触发重启）
4. telepath_list_phones          → 确认浏览器已停止
5. telepath_make_call            → 用新号码拨打（重新启动+注册）
6. telepath_list_phones          → 确认所有号码状态正常
```

---

## ❌ 异常测试

### E-01: 无效号码拨打

**步骤**: `telepath_make_call` 使用不存在的 fromNumber

**预期**: 返回错误信息

---

### E-02: 删除不存在的电话

**步骤**: `telepath_delete_phone` 使用无效 phoneId（如 `invalid_id_12345`）

**预期**: 返回错误 `电话 ID "invalid_id_12345" 不存在或已被删除`

---

### E-03: 重复添加相同号码

**步骤**: `telepath_add_phone` 使用已存在的 phoneNumber（如 `+12098882165`）

**预期**: 返回错误 `电话号码 +12098882165 已存在 (ID: xxx)`

---

## ✅ 测试检查清单

### 基础用例（按工具 × 状态）

| 工具 | 未启动 (a) | 已启动 (b) |
|------|------------|------------|
| list_phones | ⬜ TC-01a | ⬜ TC-01b |
| call_status | ⬜ TC-02a | ⬜ TC-02b |
| make_call | ⬜ TC-03a | ⬜ TC-03b |
| hangup | ⬜ TC-04a | ⬜ TC-04b |
| add_phone | ⬜ TC-05a | ⬜ TC-05b |
| delete_phone | ⬜ TC-06a | ⬜ TC-06b |
| stop_browser | ⬜ TC-07a | ⬜ TC-07b |

### 场景测试

| 用例 | 状态 | 说明 |
|------|------|------|
| S-01 | ⬜ | 完整通话流程 |
| S-02 | ⬜ | 号码管理流程 |
| S-03 | ⬜ | 浏览器重启后状态恢复 |
| S-04 | ⬜ | 添加号码触发浏览器重启 |

### 异常测试

| 用例 | 状态 | 说明 |
|------|------|------|
| E-01 | ⬜ | 无效号码拨打 |
| E-02 | ⬜ | 删除不存在的电话 |
| E-03 | ⬜ | 重复添加相同号码 |

