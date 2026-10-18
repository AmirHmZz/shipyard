import type { Start } from "../generics";
export function followGitSetup(result: Start) {
  if (result.manifest) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = result.url;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "manifest";
    input.value = JSON.stringify(result.manifest);
    form.append(input);
    document.body.append(form);
    form.submit();
  } else window.location.assign(result.url);
}
