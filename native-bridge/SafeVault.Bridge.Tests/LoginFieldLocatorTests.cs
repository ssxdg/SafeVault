using SafeVault.Bridge.Automation;

namespace SafeVault.Bridge.Tests;

public sealed class LoginFieldLocatorTests
{
    private static AutomationFieldCandidate Field(string id, bool password, int order, string name = "", bool focused = false)
        => new(id, name, password, true, true, focused, order);

    [Fact]
    public void ExplicitSelectorsChooseUniqueFields()
    {
        var fields = new[] { Field("user", false, 1), Field("pass", true, 2), Field("other", false, 3) };
        var result = LoginFieldLocator.Locate(fields, new("user"), new("pass"));
        Assert.Equal("ok", result.Code);
        Assert.Equal(new FieldSelection(0, 1), result.Selection);
    }

    [Fact]
    public void StandardPairUsesNearestEditBeforePassword()
    {
        var fields = new[] { Field("search", false, 1), Field("user", false, 2), Field("pass", true, 3) };
        var result = LoginFieldLocator.Locate(fields);
        Assert.Equal(new FieldSelection(1, 2), result.Selection);
    }

    [Fact]
    public void MultiplePasswordsFailSafely()
    {
        var fields = new[] { Field("user", false, 1), Field("pass1", true, 2), Field("pass2", true, 3) };
        var result = LoginFieldLocator.Locate(fields);
        Assert.Null(result.Selection);
        Assert.Equal("ambiguous-fields", result.Code);
    }

    [Fact]
    public void MissingFieldsFailSafely()
    {
        var result = LoginFieldLocator.Locate(new[] { Field("user", false, 1) });
        Assert.Null(result.Selection);
        Assert.Equal("fields-not-found", result.Code);
    }
}
