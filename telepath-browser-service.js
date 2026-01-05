/**
 * TelePath Browser Service
 *
 * 通过 Puppeteer 控制 TelePath 网页，实现 WebRTC 通话功能。
 *
 * 架构:
 * - REST API: 快速查询（电话列表、通话状态）
 * - Puppeteer: WebRTC 操作（拨打、挂断）
 *
 * 环境变量 (必需):
 * - TELEPATH_USERNAME: 用户名
 * - TELEPATH_PASSWORD: 密码
 *
 * 环境变量 (可选):
 * - TELEPATH_USER_ID: 用户 ID (自动获取)
 * - TELEPATH_BOARD_ID: Phone Board ID (自动获取)
 * - TELEPATH_ENV_NAME: 环境名称 (默认 XMR-UP-XMN)
 */

import puppeteer from 'puppeteer';

// ============ 常量定义 ============
const DEFAULT_TELEPATH_URL = 'https://telepath.int.rclabenv.com';
const DEFAULT_ENV_NAME = 'XMR-UP-XMN';

// 超时配置 (毫秒)
const TIMEOUTS = {
  REGISTRATION: 30000,    // 电话注册等待
  PAGE_LOAD: 30000,       // 页面加载
  UI_STABLE: 1000,        // UI 稳定等待
  CALL_ESTABLISH: 2000,   // 通话建立等待
  NAVIGATION: 1500,       // 导航等待
};

// ============ 主类 ============
class TelepathBrowserService {
  constructor(telepathUrl) {
    this.telepathUrl = telepathUrl || DEFAULT_TELEPATH_URL;
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.selectedPhone = null;
    this.config = null;
    this.accessToken = null;
    this.hasEnteredBoard = false;  // 是否已经进入过 board

    // 从环境变量加载配置
    this.config = this._loadConfig();
  }

  /**
   * 加载配置 - 从环境变量读取
   */
  _loadConfig() {
    const username = process.env.TELEPATH_USERNAME;
    const password = process.env.TELEPATH_PASSWORD;

    if (!username || !password) {
      console.error('❌ 缺少必需环境变量:');
      if (!username) console.error('   - TELEPATH_USERNAME');
      if (!password) console.error('   - TELEPATH_PASSWORD');
      console.error('\n请在 MCP 配置中设置 env');
      return null;
    }

    console.log('📋 使用环境变量配置');
    return {
      auth: { username, password },
      xmnup: {
        userId: process.env.TELEPATH_USER_ID,
        boardId: process.env.TELEPATH_BOARD_ID,
        envName: process.env.TELEPATH_ENV_NAME || DEFAULT_ENV_NAME,
      }
    };
  }

  /**
   * 确保配置已加载且有效
   */
  _ensureConfig() {
    if (!this.config || !this.config.auth) {
      throw new Error('配置未加载，请设置 TELEPATH_USERNAME 和 TELEPATH_PASSWORD 环境变量');
    }
  }

  /**
   * 等待指定毫秒数
   */
  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============ REST API 方法 (快速) ============

  /**
   * 使用 REST API 登录获取 token
   */
  async apiLogin() {
    this._ensureConfig();
    const { username, password } = this.config.auth;
    const response = await fetch(`${this.telepathUrl}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error(`登录失败: HTTP ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.accessToken;
    this.isLoggedIn = true;

    // 保存登录返回的 userId，确保 xmnup 对象存在
    if (!this.config.xmnup) {
      this.config.xmnup = {};
    }
    // API 返回的是 id (不是 _id)
    const userId = data.id || data._id;
    if (userId) {
      this.config.xmnup.userId = userId;
    }

    return data;
  }

  /**
   * 自动获取 XMN-UP Board ID
   */
  async _ensureBoardId() {
    if (this.config.xmnup?.boardId) return;

    const userId = this.config.xmnup?.userId;
    if (!userId) throw new Error('需要先登录获取 userId');

    // 获取所有 boards
    const response = await fetch(
      `${this.telepathUrl}/api/users/${userId}/phoneBoards`,
      { headers: { 'x-access-token': this.accessToken } }
    );

    if (!response.ok) throw new Error(`获取 boards 失败: HTTP ${response.status}`);

    const boards = await response.json();
    // 查找 XMN-UP board (API 返回的是 label 字段，不是 name)
    const xmnUpBoard = boards.find(b => b.label === 'XMN-UP' || b.label?.includes('XMN'));

    if (xmnUpBoard) {
      this.config.xmnup.boardId = xmnUpBoard._id;
      console.log(`📋 自动获取 Board: ${xmnUpBoard.label} (${xmnUpBoard._id})`);
    } else if (boards.length > 0) {
      // 使用第一个 board
      this.config.xmnup.boardId = boards[0]._id;
      console.log(`📋 使用第一个 Board: ${boards[0].label}`);
    } else {
      throw new Error('没有找到任何 Phone Board');
    }
  }

  /**
   * REST API: 获取电话列表
   */
  async apiGetPhones() {
    if (!this.accessToken) await this.apiLogin();
    await this._ensureBoardId();

    const { userId, boardId } = this.config.xmnup;
    const response = await fetch(
      `${this.telepathUrl}/api/users/${userId}/phoneBoards/${boardId}/phones`,
      { headers: { 'x-access-token': this.accessToken } }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  /**
   * 生成随机电话号码
   * 格式: +1209888xxxx (后四位随机)
   */
  _generatePhoneNumber() {
    const suffix = Math.floor(1000 + Math.random() * 9000); // 1000-9999
    return `+1209888${suffix}`;
  }

  /**
   * REST API: 创建新电话
   * @param {Object} options - 可选配置
   * @param {string} options.phoneNumber - 电话号码 (默认自动生成 +1209888xxxx)
   * @param {string} options.label - 电话标签 (默认 "New Phone")
   * @param {string} options.envName - 环境名称 (默认 "XMR-UP-XMN"，必须用此环境才能注册成功)
   * @param {string} options.trunk - Trunk 类型 (默认 "rc"，必须用 "rc" 才能注册成功)
   *
   * ⚠️ 注意:
   * - envName 必须是 "XMR-UP-XMN"
   * - trunk 必须是 "rc"
   * - 同一 Board 最多同时注册 3 个电话号码
   */
  async apiAddPhone(options = {}) {
    if (!this.accessToken) await this.apiLogin();
    await this._ensureBoardId();

    const { userId, boardId } = this.config.xmnup;
    const phoneNumber = options.phoneNumber || this._generatePhoneNumber();
    const label = options.label || 'New Phone';
    const envName = options.envName || 'XMR-UP-XMN';  // 必须用 XMR-UP-XMN 才能注册成功
    const trunk = options.trunk || 'rc';

    // 根据环境名称确定 SIP domain
    const sipDomain = this._getSipDomain(envName);

    const phoneData = {
      label,
      user: userId,
      board: boardId,
      column: 0,
      rank: 0,
      color: '#ff7300',
      envName,
      configType: 'manual',
      provisioning: {
        vendor: '',
        model: '',
        link: '',
        serialNumber: '',
        interval: 0,
        fw: ''
      },
      sipAccounts: [{
        label: `trunk: ${trunk}`,
        username: phoneNumber,
        domain: sipDomain,
        outboundProxy: '',
        authId: '',
        password: '',
        bca: {
          numAppearances: 0,
          extensionId: '',
          ringDelay: 0
        },
        integration: {
          type: '',
          inboundEdgeId: ''
        }
      }],
      phoneLines: [],
      rcIds: {
        accountId: '',
        extensionId: ''
      },
      phoneFeatures: {
        isEnabledDnd: false,
        customHeaders: [],
        cffp: {
          target: '',
          always: false,
          noAnswer: false,
          busy: false
        },
        showPai: false,
        isEnabled183Response: false,
        holdOnTransfer: true
      },
      codecs: {
        enabled: [
          { code: 111, name: 'OPUS' },
          { code: 63, name: 'RED' },
          { code: 9, name: 'G722' },
          { code: 0, name: 'PCMU' },
          { code: 8, name: 'PCMA' },
          { code: 13, name: 'CN' },
          { code: 110, name: 'telephone-event' },
          { code: 126, name: 'telephone-event' }
        ],
        disabled: []
      }
    };

    const response = await fetch(
      `${this.telepathUrl}/api/users/${userId}/phoneBoards/${boardId}/phones`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': this.accessToken
        },
        body: JSON.stringify(phoneData)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`创建电话失败: HTTP ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // 如果浏览器正在运行，需要重启才能注册新号码
    const needsRestart = this.browser !== null;
    if (needsRestart) {
      console.log('🔄 检测到浏览器正在运行，需要重启以注册新号码...');
      await this.stop();
    }

    return {
      id: result.id,
      phoneNumber,
      label,
      envName,
      trunk,
      needsRestart,
      message: needsRestart
        ? '⚠️ 新号码已创建，浏览器已重启。下次操作时会自动启动并等待注册。'
        : '✅ 新号码已创建。首次使用前需要启动浏览器并等待注册完成。'
    };
  }

  /**
   * 根据环境名称获取 SIP domain
   * 注意: 不要带端口号，否则无法注册成功
   */
  _getSipDomain(envName) {
    // 常用环境的 SIP domain 映射 (不带端口号!)
    const domainMap = {
      'XMN-UP': 'siptel-xmnup.int.rclabenv.com',
      'XMR-UP-XMN': 'siptel-xmrupxmn.int.rclabenv.com',
      'AI-DEM-AMS': 'siptel-aidemams.int.rclabenv.com',
    };

    if (domainMap[envName]) {
      return domainMap[envName];
    }

    // 默认格式: siptel-{envname-lowercase}.int.rclabenv.com (不带端口号!)
    const envLower = envName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `siptel-${envLower}.int.rclabenv.com`;
  }

  /**
   * REST API: 获取通话记录/状态
   */
  async apiGetCalls(phoneId) {
    if (!this.accessToken) await this.apiLogin();
    await this._ensureBoardId();

    const { userId, boardId } = this.config.xmnup;
    const response = await fetch(
      `${this.telepathUrl}/api/users/${userId}/phoneBoards/${boardId}/phones/${phoneId}/phoneCalls`,
      { headers: { 'x-access-token': this.accessToken } }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  /**
   * REST API: 删除电话
   * @param {string} phoneId - 电话 ID
   */
  async apiDeletePhone(phoneId) {
    if (!this.accessToken) await this.apiLogin();
    await this._ensureBoardId();

    const { userId, boardId } = this.config.xmnup;
    const response = await fetch(
      `${this.telepathUrl}/api/users/${userId}/phoneBoards/${boardId}/phones/${phoneId}`,
      {
        method: 'DELETE',
        headers: { 'x-access-token': this.accessToken }
      }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { success: true, phoneId };
  }

  // ============ 浏览器方法 (用于 WebRTC 操作) ============

  /**
   * 启动浏览器并初始化
   */
  async start(headless = true) {
    console.log('🚀 启动 TelePath Browser Service...');
    
    this.browser = await puppeteer.launch({
      headless: headless ? 'new' : false,
      args: [
        '--use-fake-ui-for-media-stream',     // 自动允许麦克风权限
        '--use-fake-device-for-media-stream', // 使用虚拟音频设备
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
    
    this.page = await this.browser.newPage();
    
    // 监听控制台消息
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser Error:', msg.text());
      }
    });
    
    console.log(`📍 访问 ${this.telepathUrl}`);
    await this.page.goto(this.telepathUrl, { waitUntil: 'networkidle2' });

    // 自动登录
    if (this.config && this.config.auth) {
      await this.login();
    }

    console.log('✅ Browser Service 已启动');
    return this;
  }

  /**
   * 登录 TelePath
   */
  async login() {
    console.log('🔐 正在登录...');

    const { username, password } = this.config.auth;

    // 方法 1: 通过 API 登录并注入 token
    try {
      const loginResult = await this.page.evaluate(async (user, pass, baseUrl) => {
        const response = await fetch(`${baseUrl}/api/auth/signin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user, password: pass })
        });

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` };
        }

        const data = await response.json();

        // 存储 token 到 localStorage
        if (data.accessToken) {
          localStorage.setItem('access_token', data.accessToken);
          localStorage.setItem('user', JSON.stringify(data));
        }

        return { success: true, userId: data.id, token: data.accessToken };
      }, username, password, this.telepathUrl);

      if (loginResult.success) {
        console.log(`✅ 登录成功! User ID: ${loginResult.userId}`);
        this.accessToken = loginResult.token;
        this.isLoggedIn = true;

        // 保存 userId 到配置（与 apiLogin 保持一致）
        if (!this.config.xmnup) {
          this.config.xmnup = {};
        }
        if (loginResult.userId) {
          this.config.xmnup.userId = loginResult.userId;
        }

        // 刷新页面以应用登录状态
        await this.page.reload({ waitUntil: 'networkidle2' });
      } else {
        console.log(`❌ 登录失败: ${loginResult.error}`);
      }
    } catch (error) {
      console.log(`❌ 登录异常: ${error.message}`);
    }
  }

  /**
   * 获取可用的电话列表
   */
  async getPhones() {
    console.log('📱 获取电话列表...');

    if (!this.config || !this.config.xmnup) {
      throw new Error('缺少 xmnup 配置');
    }

    const { userId, boardId } = this.config.xmnup;

    // 通过 API 获取 (需要带上 token)
    const phones = await this.page.evaluate(async (baseUrl, uid, bid) => {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${baseUrl}/api/users/${uid}/phoneBoards/${bid}/phones`, {
        headers: token ? { 'x-access-token': token } : {}
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      return response.json();
    }, this.telepathUrl, userId, boardId);

    console.log(`找到 ${phones.length} 个电话`);
    return phones;
  }

  /**
   * 获取电话的 SIP 凭据 (从 RingCentral API)
   */
  async getSipCredentials(phone) {
    console.log(`🔑 获取 SIP 凭据...`);

    if (!phone.rcIds || !phone.rcIds.accountId) {
      console.log('⚠️ 电话没有关联 RingCentral 账户');
      return null;
    }

    const { envName, rcIds } = phone;
    const deviceId = phone.sipAccounts?.[0]?.deviceId;

    if (!deviceId) {
      console.log('⚠️ 电话没有 deviceId');
      return null;
    }

    // 调用 RingCentral API 获取 SIP 信息
    const sipInfo = await this.page.evaluate(async (baseUrl, envId, accountId, devId) => {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `${baseUrl}/api/environments/${envId}/accounts/${accountId}/devices/${devId}/sipInfo`,
        { headers: token ? { 'x-access-token': token } : {} }
      );

      if (!response.ok) {
        return { error: `HTTP ${response.status}` };
      }

      return response.json();
    }, this.telepathUrl, envName, rcIds.accountId, deviceId);

    if (sipInfo.error) {
      console.log(`❌ 获取 SIP 凭据失败: ${sipInfo.error}`);
      return null;
    }

    console.log('✅ 获取到 SIP 凭据');
    return sipInfo;
  }

  /**
   * 确保已导航到 XMN-UP Board
   */
  async ensureOnBoard() {
    // 如果已经进入过 board，只检查是否还在 board 中
    if (this.hasEnteredBoard) {
      const hasPhones = await this.page.evaluate(() => {
        const textboxes = document.querySelectorAll('input[type="text"], input:not([type])');
        return textboxes.length >= 3;
      });
      if (hasPhones) return true;
    }

    console.log('📍 导航到 XMN-UP Board...');

    // 点击 XMN-UP
    await this.page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if (el.textContent?.trim() === 'XMN-UP') {
          el.click();
          return;
        }
      }
    });

    await this._wait(TIMEOUTS.NAVIGATION);

    // 首次进入 board，等待所有号码注册完成
    if (!this.hasEnteredBoard) {
      console.log('🔄 首次进入 Board，等待所有号码注册...');
      await this.waitForAllPhonesReady();
      this.hasEnteredBoard = true;
    }

    return true;
  }

  /**
   * 等待所有电话号码注册完成
   * 在首次进入 board 后调用，确保所有号码都准备好
   */
  async waitForAllPhonesReady(timeout = TIMEOUTS.REGISTRATION * 2) {
    console.log('⏳ 等待所有电话号码注册...');
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // 获取所有电话的注册状态
      const statuses = await this.page.evaluate(() => {
        const results = [];
        const allTDs = document.querySelectorAll('td');

        for (const td of allTDs) {
          const text = td.innerText?.trim();
          // 匹配电话号码格式
          if (text && /^\+\d{10,15}$/.test(text)) {
            let container = td;
            let hasVisibleInput = false;
            let isRegistering = false;

            // 向上查找容器
            for (let i = 0; i < 10 && container; i++) {
              container = container.parentElement;
              if (container) {
                const input = container.querySelector('input');
                if (input) {
                  const rect = input.getBoundingClientRect();
                  hasVisibleInput = rect.width > 0 && rect.height > 0;
                }
                // 检查是否有 "registering" 文本
                if (container.innerText?.toLowerCase().includes('registering')) {
                  isRegistering = true;
                }
              }
            }

            results.push({
              number: text,
              ready: hasVisibleInput && !isRegistering
            });
          }
        }
        return results;
      });

      const allReady = statuses.length > 0 && statuses.every(s => s.ready);
      const readyCount = statuses.filter(s => s.ready).length;

      if (allReady) {
        console.log(`✅ 所有电话已注册完成 (${readyCount}/${statuses.length})`);
        return true;
      }

      console.log(`⏳ 注册中... (${readyCount}/${statuses.length} 已完成)`);
      await this._wait(TIMEOUTS.UI_STABLE);
    }

    console.log('⚠️ 等待注册超时，部分号码可能未就绪');
    return false;
  }

  /**
   * 等待电话注册完成（可见的 textbox 出现）
   * 注册完成后，电话卡片会显示可见的 textbox；未注册时 textbox 不可见
   */
  async waitForRegistration(phoneNumber, timeout = TIMEOUTS.REGISTRATION) {
    console.log(`⏳ 等待 ${phoneNumber} 注册...`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const hasVisibleTextbox = await this.page.evaluate((phone) => {
        // 找到电话号码的 TD 元素
        const allTDs = document.querySelectorAll('td');
        for (const td of allTDs) {
          if (td.innerText?.trim() === phone) {
            // 向上找到包含可见 input 的容器
            let container = td;
            for (let i = 0; i < 10 && container; i++) {
              container = container.parentElement;
              if (container) {
                const input = container.querySelector('input');
                if (input) {
                  // 检查 input 是否真的可见
                  const rect = input.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    return true;
                  }
                }
              }
            }
          }
        }
        return false;
      }, phoneNumber);

      if (hasVisibleTextbox) {
        console.log(`✅ ${phoneNumber} 已注册（textbox 可见）`);
        return true;
      }

      await this._wait(TIMEOUTS.UI_STABLE);
    }

    console.log(`⚠️ ${phoneNumber} 注册超时`);
    return false;
  }

  /**
   * 发起呼叫 - 基于 Chrome DevTools 验证的 UI 结构
   *
   * 页面结构 (验证于 2026-01-05):
   * - 每个电话卡片包含: LayoutTable > LayoutTableRow > [button, cell, cell(电话号码), cell(trunk)]
   * - 电话号码下方有: textbox + button(拨号) + button(其他)
   * - 注册完成后 textbox 才会显示（lazy load）
   * - 输入号码后点击 textbox 右侧第一个 button 即可拨打
   */
  async makeCall(fromNumber, toNumber) {
    console.log(`📞 从 ${fromNumber} 呼叫 ${toNumber}`);

    // 1. 确保在正确的 board
    await this.ensureOnBoard();
    await this._wait(TIMEOUTS.CALL_ESTABLISH);

    // 2. 等待电话注册完成（textbox 出现）
    const registered = await this.waitForRegistration(fromNumber);
    if (!registered) {
      return { success: false, error: `电话 ${fromNumber} 注册超时` };
    }

    // 3. 等待 UI 稳定
    await this._wait(TIMEOUTS.UI_STABLE);

    // 4. 查找并操作 UI 元素
    const result = await this.page.evaluate((from, to) => {
      // 策略: 找到显示电话号码的 TD 元素（innerText 精确匹配），然后向上找 textbox

      // 遍历所有 TD 元素，找到 innerText 精确匹配电话号码的
      const allTDs = document.querySelectorAll('td');
      let phoneTD = null;

      for (const td of allTDs) {
        if (td.innerText?.trim() === from) {
          phoneTD = td;
          break;
        }
      }

      if (!phoneTD) {
        return { success: false, error: `未找到电话号码 ${from}` };
      }

      // 向上找到包含 input 的容器（电话卡片）
      let container = phoneTD;
      let textbox = null;

      for (let i = 0; i < 10 && container; i++) {
        container = container.parentElement;
        if (container) {
          textbox = container.querySelector('input');
          if (textbox) break;
        }
      }

      if (!textbox) {
        return { success: false, error: '未找到拨号输入框' };
      }

      // 输入被叫号码
      textbox.focus();
      textbox.value = to;
      textbox.dispatchEvent(new Event('input', { bubbles: true }));
      textbox.dispatchEvent(new Event('change', { bubbles: true }));

      // 找到 textbox 父容器中的第一个 button（拨号按钮）
      const parent = textbox.parentElement;
      const buttons = parent?.querySelectorAll('button') || [];

      if (buttons.length === 0) {
        return { success: false, error: '未找到拨号按钮', textboxFound: true };
      }

      // 第一个 button 是拨号按钮
      buttons[0].click();

      return {
        success: true,
        from: from,
        to: to
      };
    }, fromNumber, toNumber);

    console.log(`呼叫结果:`, result);

    // 等待呼叫建立
    if (result.success) {
      await this._wait(TIMEOUTS.CALL_ESTABLISH);
    }

    return result;
  }

  /**
   * 挂断呼叫 - 基于截图验证的 UI 结构
   *
   * 验证于 2026-01-05:
   * - 通话中显示: 被叫号码、时间、图标按钮（转接、会议、拨号盘、Hold、停止、挂断红X）、Add New Call
   * - 挂断按钮是 "Add New Call" 前面的无文本按钮（红色X图标）
   */
  async hangup() {
    console.log('📴 挂断呼叫...');

    const result = await this.page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));

      // 方法1: 找 "Add New Call" 按钮，挂断按钮在它前面
      let addNewCallIndex = -1;
      for (let i = 0; i < allButtons.length; i++) {
        if (allButtons[i].textContent?.trim() === 'Add New Call') {
          addNewCallIndex = i;
          break;
        }
      }

      if (addNewCallIndex > 0) {
        // 挂断按钮是 Add New Call 前面的无文本按钮
        for (let i = addNewCallIndex - 1; i >= 0 && i >= addNewCallIndex - 3; i--) {
          const btn = allButtons[i];
          const text = btn.textContent?.trim();
          if (!text) {
            btn.click();
            return { success: true, method: 'button-before-add-new-call' };
          }
        }
      }

      // 方法2: 找通话时间元素（格式 00:00:00），然后找附近的无文本按钮
      const timePattern = /^\d{2}:\d{2}:\d{2}$/;
      const allText = document.body.innerText;
      const hasCallTimer = timePattern.test(allText.match(/\d{2}:\d{2}:\d{2}/)?.[0] || '');

      if (hasCallTimer) {
        // 通话中，找所有无文本按钮，最后一个通常是挂断
        const emptyButtons = allButtons.filter(b => !b.textContent?.trim());
        if (emptyButtons.length > 0) {
          const hangupBtn = emptyButtons[emptyButtons.length - 1];
          hangupBtn.click();
          return { success: true, method: 'last-empty-button' };
        }
      }

      return { success: false, error: '当前没有通话或未找到挂断按钮' };
    });

    console.log(`挂断结果:`, result);
    return result;
  }

  /**
   * 获取所有电话的状态（闲置/通话中/来电）
   * 返回每个电话号码的实时状态
   */
  async getPhoneStatuses() {
    await this.ensureOnBoard();
    await this._wait(TIMEOUTS.UI_STABLE);

    const statuses = await this.page.evaluate(() => {
      const results = [];
      const allTDs = document.querySelectorAll('td');

      // 找到所有电话号码
      for (const td of allTDs) {
        const text = td.innerText?.trim();
        if (text?.match(/^\+\d{10,15}$/)) {
          const phoneNumber = text;

          // 向上找到电话卡片容器
          let container = td;
          for (let i = 0; i < 10 && container; i++) {
            container = container.parentElement;
            if (container?.querySelector('input')) break;
          }

          if (!container) continue;

          // 检查状态
          const containerText = container.innerText || '';
          const hasInput = container.querySelector('input');
          const inputVisible = hasInput && hasInput.getBoundingClientRect().width > 0;

          // 检查是否有通话时间（格式 00:00:00）
          const hasCallTimer = /\d{2}:\d{2}:\d{2}/.test(containerText);

          // 检查来电状态
          const isRinging = containerText.includes('Ringing') || containerText.includes('Incoming');
          const isCalling = containerText.includes('Calling');

          // 检查是否有 Add New Call 按钮（表示正在通话）
          const hasAddNewCall = containerText.includes('Add New Call');

          let status = 'unknown';
          let canReceiveCall = false;

          if (isRinging) {
            status = 'ringing';  // 来电中
            canReceiveCall = false;
          } else if (isCalling || hasCallTimer || hasAddNewCall) {
            status = 'in_call';  // 通话中
            canReceiveCall = false;
          } else if (inputVisible) {
            status = 'idle';     // 闲置，可接听来电
            canReceiveCall = true;
          } else {
            status = 'registering';  // 注册中
            canReceiveCall = false;
          }

          results.push({
            number: phoneNumber,
            status,
            canReceiveCall
          });
        }
      }

      return results;
    });

    return statuses;
  }

  /**
   * 获取当前通话状态 - 基于 UI 检测
   */
  async getCallStatus() {
    const status = await this.page.evaluate(() => {
      // 检查是否有通话控制按钮
      const controlButtons = ['Transfer', 'Hold', 'Park', 'Dialpad', 'Add New Call'];
      const allButtons = document.querySelectorAll('button');

      let hasCallControls = false;
      for (const btn of allButtons) {
        if (controlButtons.includes(btn.textContent?.trim())) {
          hasCallControls = true;
          break;
        }
      }

      if (!hasCallControls) {
        return { status: 'idle', inCall: false };
      }

      // 检查页面文本获取更详细状态
      const pageText = document.body.innerText;
      if (pageText.includes('Ringing')) return { status: 'ringing', inCall: true };
      if (pageText.includes('Calling')) return { status: 'calling', inCall: true };
      if (pageText.includes('On Hold')) return { status: 'hold', inCall: true };

      return { status: 'connected', inCall: true };
    });

    return status;
  }

  /**
   * 停止服务
   */
  async stop() {
    console.log('🛑 停止 Browser Service...');
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
    // 重置状态，下次启动需要重新等待注册
    this.hasEnteredBoard = false;
  }
}

export default TelepathBrowserService;
