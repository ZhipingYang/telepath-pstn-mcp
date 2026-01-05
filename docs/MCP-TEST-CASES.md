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

## 🧪 测试用例

### TC-01: 获取电话列表（浏览器未启动）

**前置条件**: 浏览器未启动

**步骤**:
1. 调用 `telepath_list_phones`

**预期结果**:
- ✅ 返回电话列表（从 API 获取）
- ✅ 显示 "💡 拨打电话时会自动启动浏览器"
- ✅ 不显示实时状态（status, canReceiveCall）

---

### TC-02: 拨打电话（自动启动浏览器）

**前置条件**: 
- 浏览器未启动
- 至少有 2 个电话号码

**步骤**:
1. 调用 `telepath_make_call`
   - fromNumber: 第一个号码
   - toNumber: 任意被叫号码

**预期结果**:
- ✅ 浏览器自动启动
- ✅ 自动等待所有号码注册完成
- ✅ 拨打成功，返回 `{"success": true}`
- ✅ 控制台日志显示 "🔄 首次进入 Board，等待所有号码注册..."

---

### TC-03: 获取电话列表（浏览器已启动）

**前置条件**: 浏览器已启动，有通话进行中

**步骤**:
1. 调用 `telepath_list_phones`

**预期结果**:
- ✅ 返回电话列表（含实时状态）
- ✅ 每个号码显示 status: idle/in_call/ringing
- ✅ 显示 canReceiveCall: true/false
- ✅ 显示 "📊 实时状态" 汇总
- ✅ 显示 "✅ 浏览器已启动，可以拨打/接听电话"

---

### TC-04: 获取通话状态

**前置条件**: 有通话进行中

**步骤**:
1. 调用 `telepath_call_status`

**预期结果**:
- ✅ 返回通话状态信息
- ✅ 包含 hasActiveCall, callDuration 等字段

---

### TC-05: 挂断电话

**前置条件**: 有通话进行中

**步骤**:
1. 调用 `telepath_hangup`

**预期结果**:
- ✅ 通话挂断
- ✅ 返回 `{"success": true, "method": "..."}`
- ✅ 再次调用 `telepath_list_phones`，该号码状态变为 idle

---

### TC-06: 添加新电话（浏览器未启动）

**前置条件**: 浏览器未启动

**步骤**:
1. 调用 `telepath_add_phone`（使用默认参数）

**预期结果**:
- ✅ 新号码创建成功
- ✅ 返回新号码信息（id, phoneNumber, label, envName, trunk）
- ✅ 显示提示信息

---

### TC-07: 添加新电话（浏览器已启动）⭐

**前置条件**: 浏览器已启动

**步骤**:
1. 调用 `telepath_add_phone`（使用默认参数）

**预期结果**:
- ✅ 新号码创建成功
- ✅ 浏览器自动停止
- ✅ 返回消息包含 "⚠️ 新号码已创建，浏览器已重启"
- ✅ 再次调用 `telepath_list_phones`，显示 "💡 拨打电话时会自动启动浏览器"

---

### TC-08: 新号码首次使用

**前置条件**: 
- 刚添加新号码
- 浏览器未启动

**步骤**:
1. 用新号码调用 `telepath_make_call`

**预期结果**:
- ✅ 浏览器启动
- ✅ 等待所有号码（包括新号码）注册完成
- ✅ 拨打成功
- ✅ 控制台显示注册进度 "⏳ 注册中... (x/y 已完成)"

---

### TC-09: 删除电话

**前置条件**: 至少有 2 个电话号码

**步骤**:
1. 调用 `telepath_list_phones` 获取电话 ID
2. 调用 `telepath_delete_phone`
   - phoneId: 要删除的电话 ID

**预期结果**:
- ✅ 删除成功
- ✅ 返回 `{"success": true}`
- ✅ 再次调用 `telepath_list_phones`，该号码不存在

---

### TC-10: 停止浏览器

**前置条件**: 浏览器已启动

**步骤**:
1. 调用 `telepath_stop_browser`

**预期结果**:
- ✅ 返回 "🛑 浏览器已停止"
- ✅ 再次调用 `telepath_list_phones`，显示 "💡 拨打电话时会自动启动浏览器"
- ✅ 调用 `telepath_call_status`，返回 "💤 浏览器未启动，无活动通话"

---

### TC-11: 挂断（无活动通话）

**前置条件**: 浏览器已启动，无通话

**步骤**:
1. 调用 `telepath_hangup`

**预期结果**:
- ✅ 返回 `{"success": false}` 或提示无通话

---

### TC-12: 挂断（浏览器未启动）

**前置条件**: 浏览器未启动

**步骤**:
1. 调用 `telepath_hangup`

**预期结果**:
- ✅ 返回错误 "浏览器未启动，无活动通话"

---

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

**步骤**: `telepath_delete_phone` 使用无效 phoneId

**预期**: 返回错误信息

---

### E-03: 重复添加相同号码

**步骤**: `telepath_add_phone` 使用已存在的 phoneNumber

**预期**: 返回错误或提示已存在

---

## ✅ 测试检查清单

| 用例 | 状态 | 备注 |
|------|------|------|
| TC-01 | ⬜ | |
| TC-02 | ⬜ | |
| TC-03 | ⬜ | |
| TC-04 | ⬜ | |
| TC-05 | ⬜ | |
| TC-06 | ⬜ | |
| TC-07 | ⬜ | |
| TC-08 | ⬜ | |
| TC-09 | ⬜ | |
| TC-10 | ⬜ | |
| TC-11 | ⬜ | |
| TC-12 | ⬜ | |
| S-01 | ⬜ | |
| S-02 | ⬜ | |
| S-03 | ⬜ | |
| S-04 | ⬜ | |
| E-01 | ⬜ | |
| E-02 | ⬜ | |
| E-03 | ⬜ | |

