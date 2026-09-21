# SafeVault 浏览器兼容性矩阵

测试日期：2026-09-21

本矩阵仅记录页面结构和填充结果，不记录真实账号、密码、OTP 或测试人员身份。自动化测试已经覆盖动态插入、同源/跨域 iframe、用户名与密码分步、密码修改、OTP 和隐藏诱饵字段；真实网站结果必须在 Chrome、Edge 中由人工使用专用测试账号验收。

| # | Origin | 主要表单类型 | Chrome | Edge | 已知限制 |
|---:|---|---|---|---|---|
| 1 | `https://accounts.google.com` | 分步登录 | 待人工 | 待人工 | 可能触发验证码或 WebAuthn |
| 2 | `https://login.microsoftonline.com` | 分步登录 | 待人工 | 待人工 | 租户页面可能嵌套或跳转 |
| 3 | `https://github.com` | 标准登录 | 待人工 | 待人工 | 2FA 不自动填充 |
| 4 | `https://gitlab.com` | 标准登录 | 待人工 | 待人工 | CAPTCHA 不自动处理 |
| 5 | `https://www.amazon.com` | 分步登录 | 待人工 | 待人工 | 地区站点 Origin 不共享 |
| 6 | `https://signin.ebay.com` | 分步登录 | 待人工 | 待人工 | 风险验证不自动处理 |
| 7 | `https://www.paypal.com` | 动态登录 | 待人工 | 待人工 | 安全挑战不自动处理 |
| 8 | `https://www.reddit.com` | 动态登录 | 待人工 | 待人工 | 页面结构可能频繁变化 |
| 9 | `https://www.linkedin.com` | 标准登录 | 待人工 | 待人工 | 验证码不自动处理 |
| 10 | `https://www.facebook.com` | 标准登录 | 待人工 | 待人工 | 检查点流程不自动处理 |
| 11 | `https://x.com` | 分步登录 | 待人工 | 待人工 | 可能要求附加身份信息 |
| 12 | `https://www.instagram.com` | 动态登录 | 待人工 | 待人工 | 风险验证不自动处理 |
| 13 | `https://www.dropbox.com` | 分步登录 | 待人工 | 待人工 | 第三方 SSO 不共享凭据 |
| 14 | `https://slack.com` | 工作区分步登录 | 待人工 | 待人工 | 工作区子域需单独规则 |
| 15 | `https://www.notion.so` | 分步/OTP | 待人工 | 待人工 | OTP 不作为用户名填充 |
| 16 | `https://id.atlassian.com` | 分步登录 | 待人工 | 待人工 | SSO 跳转后按新 Origin 匹配 |
| 17 | `https://stackoverflow.com` | 标准/SSO | 待人工 | 待人工 | 第三方登录按钮不自动点击 |
| 18 | `https://store.steampowered.com` | 标准登录 | 待人工 | 待人工 | 二维码与 Steam Guard 不处理 |
| 19 | `https://dash.cloudflare.com` | 标准登录 | 待人工 | 待人工 | Turnstile/2FA 不自动处理 |
| 20 | `https://account.apple.com` | 分步登录 | 待人工 | 待人工 | 系统安全验证不自动处理 |

验收状态取值：`通过`、`安全失败`、`不支持`、`待人工`。若页面跳转到不同 Origin，必须为新 Origin 配置独立规则，不得用通配符放宽匹配。
