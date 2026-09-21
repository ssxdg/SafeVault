namespace SafeVault.Bridge.Automation;

public static class LoginFieldLocator
{
    public static (FieldSelection? Selection, string Code) Locate(
        IReadOnlyList<AutomationFieldCandidate> fields,
        FieldSelector? usernameSelector = null,
        FieldSelector? passwordSelector = null)
    {
        var usable = fields
            .Select((field, index) => (field, index))
            .Where(item => item.field.IsEnabled && item.field.SupportsValue)
            .ToList();

        var passwordMatches = Match(usable, passwordSelector, true);
        if (passwordMatches.Count != 1) return (null, passwordMatches.Count == 0 ? "fields-not-found" : "ambiguous-fields");

        var usernameMatches = Match(usable, usernameSelector, false);
        if (usernameSelector is not null)
        {
            if (usernameMatches.Count != 1) return (null, usernameMatches.Count == 0 ? "fields-not-found" : "ambiguous-fields");
        }
        else
        {
            var passwordOrder = passwordMatches[0].field.Order;
            var beforePassword = usernameMatches.Where(item => item.field.Order < passwordOrder).ToList();
            usernameMatches = beforePassword.Count > 0
                ? [beforePassword.OrderByDescending(item => item.field.Order).First()]
                : usernameMatches.Where(item => item.field.HasKeyboardFocus).ToList();
            if (usernameMatches.Count != 1) return (null, usernameMatches.Count == 0 ? "fields-not-found" : "ambiguous-fields");
        }

        return (new FieldSelection(usernameMatches[0].index, passwordMatches[0].index), "ok");
    }

    private static List<(AutomationFieldCandidate field, int index)> Match(
        List<(AutomationFieldCandidate field, int index)> fields,
        FieldSelector? selector,
        bool password)
    {
        return fields.Where(item =>
            item.field.IsPassword == password
            && (selector is null
                || (!string.IsNullOrWhiteSpace(selector.AutomationId)
                    && string.Equals(item.field.AutomationId, selector.AutomationId, StringComparison.Ordinal))
                || (!string.IsNullOrWhiteSpace(selector.Name)
                    && string.Equals(item.field.Name, selector.Name, StringComparison.Ordinal))))
            .ToList();
    }
}
