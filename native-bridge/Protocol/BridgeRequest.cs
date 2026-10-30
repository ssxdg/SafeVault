using System.Text.Json.Serialization;

namespace SafeVault.Bridge.Protocol;

public sealed record BridgeRequest(
    [property: JsonPropertyName("requestId")] string RequestId,
    [property: JsonPropertyName("action")] string Action,
    [property: JsonPropertyName("origin")] string? Origin,
    [property: JsonPropertyName("accountId")] string? AccountId,
    [property: JsonPropertyName("success")] bool? Success,
    [property: JsonPropertyName("newPassword")] string? NewPassword = null,
    [property: JsonPropertyName("accountName")] string? AccountName = null,
    [property: JsonPropertyName("username")] string? Username = null,
    [property: JsonPropertyName("password")] string? Password = null,
    [property: JsonPropertyName("loginUrl")] string? LoginUrl = null)
{
    private static readonly HashSet<string> AllowedActions =
    [
        "listCredentials",
        "getCredential",
        "reportFillResult",
        "updateCredential",
        "createCredential",
    ];

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(RequestId) || RequestId.Length > 128)
            throw new InvalidDataException("requestId 无效。");
        if (!AllowedActions.Contains(Action))
            throw new InvalidDataException("未知 action。");
        if (string.IsNullOrWhiteSpace(Origin) || !Uri.TryCreate(Origin, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            throw new InvalidDataException("origin 无效。");
        if ((Action is "getCredential" or "reportFillResult" or "updateCredential") && string.IsNullOrWhiteSpace(AccountId))
            throw new InvalidDataException("该 action 需要 accountId。");
        if (Action == "reportFillResult" && Success is null)
            throw new InvalidDataException("reportFillResult 需要 success。");
        if (Action == "updateCredential" && (string.IsNullOrEmpty(NewPassword) || NewPassword.Length > 4096))
            throw new InvalidDataException("updateCredential 需要有效的 newPassword。");
        // 新建账号的登录地址必须与发起请求的网页同源，不能借当前页保存其他站点的填充规则。
        if (Action == "createCredential" && (string.IsNullOrWhiteSpace(AccountName) || AccountName.Length > 200
            || string.IsNullOrWhiteSpace(Username) || Username.Length > 320
            || string.IsNullOrEmpty(Password) || Password.Length > 4096
            || string.IsNullOrWhiteSpace(LoginUrl) || !Uri.TryCreate(LoginUrl, UriKind.Absolute, out var loginUri)
            || loginUri.Scheme != uri.Scheme || loginUri.Authority != uri.Authority
            || !string.IsNullOrEmpty(loginUri.UserInfo)))
            throw new InvalidDataException("createCredential 需要有效的账号、密码和同站登录网址。");
    }
}
