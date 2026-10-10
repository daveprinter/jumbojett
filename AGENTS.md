<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep fixed panel portals viewport-relative; never transform the document body, because it makes prompts follow the full page instead of the visible screen.
- Use the shared visual viewport hook for centered dialogs so mobile keyboards cannot cover their inputs and actions.
- Validate admin entry codes through the server-only shared predicate in both login steps; preserve rate limiting and separate email verification.
- Shared dialog and sheet content provides close and back controls; multistep panels override Back to return to the preceding step.
