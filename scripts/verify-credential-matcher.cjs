const assert = require('assert')
const {
  normalizeWebsiteOrigin,
  normalizeExecutablePath,
  findCredentialsForOrigin,
  findCredentialsForApp,
  findMatchingAppTarget,
  isSafeWindowTitlePattern,
} = require('../electron/credentialMatcher')

const data = {
  schemaVersion: 3,
  tabs: [{
    id: 'tab-main',
    name: 'Main',
    accounts: [
      {
        id: 'account-subdomain',
        accountName: 'Example Subdomain',
        username: 'subdomain-user',
        password: 'must-not-leak',
        email: 'subdomain@example.com',
        loginTargets: [{
          id: 'target-subdomain',
          type: 'website',
          origin: 'https://login.example.com',
          enabled: true,
        }],
      },
      {
        id: 'account-disabled',
        accountName: 'Disabled Website',
        loginTargets: [{
          id: 'target-disabled',
          type: 'website',
          origin: 'https://login.example.com',
          enabled: false,
        }],
      },
      {
        id: 'account-desktop',
        accountName: 'Example Desktop',
        username: 'desktop-user',
        password: 'desktop-secret',
        loginTargets: [{
          id: 'target-desktop',
          type: 'windowsApp',
          executablePath: 'C:\\Program Files\\Example\\example.exe',
          windowTitlePattern: '^Example Login$',
          enabled: true,
          fillStrategy: 'uia',
        }],
      },
      {
        id: 'account-invalid-pattern',
        accountName: 'Invalid Pattern',
        loginTargets: [{
          id: 'target-invalid-pattern',
          type: 'windowsApp',
          executablePath: 'C:\\Program Files\\Example\\example.exe',
          windowTitlePattern: '[',
          enabled: true,
          fillStrategy: 'uia',
        }],
      },
    ],
    urls: [],
  }],
}

assert.strictEqual(
  normalizeWebsiteOrigin('  https://login.example.com/sign-in?next=%2F  '),
  'https://login.example.com',
)
assert.strictEqual(normalizeWebsiteOrigin('http://login.example.com'), 'http://login.example.com')
assert.strictEqual(normalizeWebsiteOrigin('chrome://settings/'), null)
assert.strictEqual(normalizeWebsiteOrigin('file:///C:/login.html'), null)
assert.strictEqual(normalizeWebsiteOrigin('example.com/login'), null)
assert.strictEqual(normalizeWebsiteOrigin('https://user:secret@example.com/login'), null)

assert.strictEqual(
  normalizeExecutablePath('  C:/Program Files/Example/../Example/example.exe  '),
  'C:\\Program Files\\Example\\example.exe',
)
assert.strictEqual(normalizeExecutablePath('..\\Example\\example.exe'), null)
assert.strictEqual(normalizeExecutablePath('C:\\Program Files\\Example\\example.dll'), null)
assert.strictEqual(isSafeWindowTitlePattern('^Example Login$'), true)
assert.strictEqual(isSafeWindowTitlePattern('(a+)+$'), false)
assert.strictEqual(isSafeWindowTitlePattern('['), false)

const websiteMatches = findCredentialsForOrigin(data, 'https://login.example.com/sign-in')
assert.deepStrictEqual(websiteMatches.map(item => item.id), ['account-subdomain'])
assert.deepStrictEqual(websiteMatches[0], {
  id: 'account-subdomain',
  tabId: 'tab-main',
  tabName: 'Main',
  accountName: 'Example Subdomain',
  username: 'subdomain-user',
  email: 'subdomain@example.com',
})
assert.strictEqual(Object.hasOwn(websiteMatches[0], 'password'), false)
assert.deepStrictEqual(findCredentialsForOrigin(data, 'https://example.com.evil.test/'), [])
assert.deepStrictEqual(findCredentialsForOrigin(data, 'http://login.example.com/'), [])
assert.deepStrictEqual(findCredentialsForOrigin(data, 'chrome://settings/'), [])
assert.deepStrictEqual(findCredentialsForOrigin(data, 'file:///C:/login.html'), [])

assert.deepStrictEqual(
  findCredentialsForApp(data, {
    executablePath: 'c:\\program files\\EXAMPLE\\example.exe',
    windowTitle: 'Example Login',
  }).map(item => item.id),
  ['account-desktop'],
)
assert.deepStrictEqual(findCredentialsForApp(data, {
  executablePath: 'C:\\Program Files\\Example\\example.exe',
  windowTitle: 'Example Settings',
}), [])
assert.strictEqual(findMatchingAppTarget(data.tabs[0].accounts[2], {
  executablePath: 'c:\\program files\\example\\example.exe',
  windowTitle: 'Example Login',
})?.id, 'target-desktop')
assert.strictEqual(findMatchingAppTarget(data.tabs[0].accounts[2], {
  executablePath: 'C:\\Temp\\example.exe',
  windowTitle: 'Example Login',
}), null)
assert.deepStrictEqual(findCredentialsForApp(data, {
  executablePath: 'C:\\Temp\\example.exe',
  windowTitle: 'Example Login',
}), [])

console.log('credential matcher verification passed')
