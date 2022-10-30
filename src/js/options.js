const NUMBER_OF_KEYBOARD_SHORTCUTS = 10;

async function setUpCheckBoxes() {
  document.querySelectorAll("[data-permission-id]").forEach(async(el) => {
    const permissionId = el.dataset.permissionId;
    const permissionEnabled = await browser.permissions.contains({ permissions: [permissionId] });
    el.checked = !!permissionEnabled;
  });
}

function disablePermissionsInputs() {
  document.querySelectorAll("[data-permission-id").forEach(el => {
    el.disabled = true;
  });
}

function enablePermissionsInputs() {
  document.querySelectorAll("[data-permission-id").forEach(el => {
    el.disabled = false;
  });
}

document.querySelectorAll("[data-permission-id").forEach(async(el) => {
  const permissionId = el.dataset.permissionId;
  el.addEventListener("change", async() => {
    if (el.checked) {
      disablePermissionsInputs();
      const granted = await browser.permissions.request({ permissions: [permissionId] });
      if (!granted) {
        el.checked = false;
        enablePermissionsInputs();
      }
      return;
    }
    await browser.permissions.remove({ permissions: [permissionId] });
  });
});

async function maybeShowPermissionsWarningIcon() {
  const bothMozillaVpnPermissionsEnabled = await MozillaVPN.bothPermissionsEnabled();
  const permissionsWarningEl = document.querySelector(".warning-icon");
  permissionsWarningEl.classList.toggle("show-warning", !bothMozillaVpnPermissionsEnabled);
}

async function enableDisableSync() {
  const checkbox = document.querySelector("#syncCheck");
  await browser.storage.local.set({syncEnabled: !!checkbox.checked});
  browser.runtime.sendMessage({ method: "resetSync" });
}

async function enableDisableReplaceTab() {
  const checkbox = document.querySelector("#replaceTabCheck");
  await browser.storage.local.set({replaceTabEnabled: !!checkbox.checked});
}

async function changeTheme(event) {
  const theme = event.currentTarget;
  await browser.storage.local.set({currentTheme: theme.value});
  await browser.storage.local.set({currentThemeId: theme.selectedIndex});
}

async function setupOptions() {
  const { syncEnabled } = await browser.storage.local.get("syncEnabled");
  const { replaceTabEnabled } = await browser.storage.local.get("replaceTabEnabled");
  const { currentThemeId } = await browser.storage.local.get("currentThemeId");

  document.querySelector("#syncCheck").checked = !!syncEnabled;
  document.querySelector("#replaceTabCheck").checked = !!replaceTabEnabled;
  document.querySelector("#changeTheme").selectedIndex = currentThemeId;
  setupContainerShortcutSelects();
  setupSitekeyPatterns();
}

async function setupContainerShortcutSelects () {
  const keyboardShortcut = await browser.runtime.sendMessage({method: "getShortcuts"});
  const identities = await browser.contextualIdentities.query({});
  const fragment = document.createDocumentFragment();
  const noneOption = document.createElement("option");
  noneOption.value = "none";
  noneOption.id = "none";
  noneOption.textContent = "None";
  fragment.append(noneOption);

  for (const identity of identities) {
    const option = document.createElement("option");
    option.value = identity.cookieStoreId;
    option.id = identity.cookieStoreId;
    option.textContent = identity.name;
    fragment.append(option);
  }

  for (let i=0; i < NUMBER_OF_KEYBOARD_SHORTCUTS; i++) {
    const shortcutKey = "open_container_"+i;
    const shortcutSelect = document.getElementById(shortcutKey);
    shortcutSelect.appendChild(fragment.cloneNode(true));
    if (keyboardShortcut && keyboardShortcut[shortcutKey]) {
      const cookieStoreId = keyboardShortcut[shortcutKey];
      shortcutSelect.querySelector("#" + cookieStoreId).selected = true;
    }
  }
}

async function setupSitekeyPatterns() {
  //await browser.storage.local.set({
  //  sitekeyPatterns: [{
  //    hostname: [
  //      "(?<mf_google_com>www\\.google\\.com)",
  //    ],
  //    pathname: [
  //      "/calendar/hosted/.*",
  //      "/a/.*/ServiceLogin",
  //      "/a/.*/acs",
  //    ]
  //  }, {
  //    hostname: [
  //      "(?<mf_google_com>www\\.google\\.com)",
  //    ],
  //    pathname: [
  //      "/accounts/signin/continue",
  //    ],
  //    search: [
  //      "continue=.*?calendar\\.google\\.com.*?calendar",
  //    ]
  //  }],
  //});

  const fallback = [{hostname:[], pathname: [], search: []}];
  const {sitekeyPatterns} = await browser.storage.local.get({sitekeyPatterns: fallback});
  const container = document.querySelector(`.${SITEKEY_CONTAINER}`);

  container.querySelectorAll(`.${SITEKEY_PATTERN}`).forEach(p => p.remove());

  sitekeyPatterns.forEach(pattern => {
    const patternNode = createSitekeyPattern();
    container.append(patternNode);
    Object.entries(pattern).forEach(([partId, rows]) => {
      const partNode = patternNode.querySelector(`[data-part-id=${partId}]`);
      rows.forEach((regexp, index) => {
        let rowNode;
        if (index > 0) {
          rowNode = createSitekeyRow(partId);
          partNode.append(rowNode);
        } else {
          rowNode = partNode.querySelector(`.${SITEKEY_ROW}`);
        }
        rowNode.querySelector("input").value = regexp;
      });
    });
  });

  updateSitekeyDisabledStates();
}

function storeSitekeyPatterns() {
  const filter = obj => Object.fromEntries(Object.entries(obj).filter(([,a]) => a.length));
  const values = inputs => [...inputs].map(i => i.value).filter(s => !!s);
  const sitekeyPatterns = [...document.querySelectorAll(`.${SITEKEY_PATTERN}`)].map(
    pattern => [...pattern.querySelectorAll("[data-part-id]")].slice(1).reduce(
      (result, part) => filter({
        ...result,
        [part.dataset.partId]: values(part.querySelectorAll("input"))
      }), {})
  );
  browser.storage.local.set({sitekeyPatterns});
}

function storeShortcutChoice (event) {
  browser.runtime.sendMessage({
    method: "setShortcut",
    shortcut: event.target.id,
    cookieStoreId: event.target.value
  });
}

function resetOnboarding() {
  browser.storage.local.set({"onboarding-stage": 0});
}

const SITEKEY_CONTAINER = "sitekey-pattern-container";
const SITEKEY_PATTERN = "sitekey-pattern";
const SITEKEY_PART = "sitekey-part";
const SITEKEY_ROW = "sitekey-row";
const SITEKEY_ADD = "sitekey-add";
const SITEKEY_REMOVE = "sitekey-remove";

function enabledSitekeyFormElementsIn(node) {
  return node.querySelectorAll("input:not([disabled]),button:not([disabled])");
}

function updateSitekeyDisabledStates() {
  const someInputsWith = predicate => node =>
    [...node.querySelectorAll("input")].some(predicate);
  const someFilledInputs = someInputsWith(input => input.value !== "");
  const someEmptyInputs = someInputsWith(input => input.value === "");
  const relatedInput = button => button.closest(`.${SITEKEY_ROW}`).querySelector("input");

  const patternSelector = `.${SITEKEY_PART}[data-part-id=pattern]`;
  const addButtonSelector = `[data-btn-id="${SITEKEY_ADD}"]`;
  const removeButtonSelector = `[data-btn-id="${SITEKEY_REMOVE}"]`;

  document.querySelectorAll(`${patternSelector} ${removeButtonSelector}`).forEach(
    (button, index, list) => button.disabled = list.length === 1
  );
  document.querySelectorAll(`${patternSelector} ${addButtonSelector}`).forEach(
    button => button.disabled = !someFilledInputs(button.closest(`.${SITEKEY_PATTERN}`))
  );
  document.querySelectorAll(`.${SITEKEY_PATTERN}`).forEach(
    p => p.querySelectorAll(`.${SITEKEY_PART}:not([data-part-id=pattern])`).forEach(
      (part, pIndex, pList) => {
        const isFirstPart = pIndex === 0;
        const prevPartHasFilledInputs = pIndex > 0 && someFilledInputs(pList[pIndex - 1]);

        part.querySelectorAll("input").forEach(
          (input, index, list) => {
            const theFirstOne  = index === 0 && isFirstPart;
            const prevPartHasValue = index === 0 && prevPartHasFilledInputs;
            const prevInputHasValue = index > 0 && list[index - 1].value !== "";
            input.disabled = !(theFirstOne || prevPartHasValue || prevInputHasValue);
          }
        );

        part.querySelectorAll(removeButtonSelector).forEach(
          (button, index, list) => {
            const theOnlyOne = list.length === 1;
            const hasEmptySiblings = someEmptyInputs(part);
            const relatedIsFilled = relatedInput(button).value !== "";
            button.disabled = theOnlyOne || (hasEmptySiblings && relatedIsFilled);
          }
        );

        part.querySelectorAll(addButtonSelector).forEach(
          button => {
            const hasEmptySiblings = someEmptyInputs(part);
            const relatedIsEmpty = relatedInput(button).value === "";
            button.disabled = relatedIsEmpty || hasEmptySiblings;
          }
        );
      }
    )
  );
}

function updateSitekeyPatternsOnChange() {
  updateSitekeyDisabledStates();
  storeSitekeyPatterns();
}

function registerSitekeyInput(input) {
  input.addEventListener("keydown", (event) => {
    if (["Enter", "Tab"].includes(event.code)) {
      event.code === "Enter" && event.preventDefault();
      updateSitekeyPatternsOnChange();
    }
  });
  input.addEventListener("change", updateSitekeyPatternsOnChange);
}

function createSitekeyInput() {
  const input = document.createElement("input");
  input.type = "text";
  input.value = "";
  registerSitekeyInput(input);
  return input;
}

function createSitekeyButton(btnId) {
  const button = document.createElement("button");
  button.dataset.btnId = btnId;
  button.disabled = true;
  button.type = "button";
  button.textContent = btnId === SITEKEY_REMOVE ? "-" : "+";
  button.addEventListener("click", onClickSitekeyButton);
  return button;
}

function createSitekeyRow(urlpart) {
  const el = document.createElement("div");
  el.className = SITEKEY_ROW;

  if (urlpart !== "pattern") {
    el.append(createSitekeyInput());
  }

  el.append(createSitekeyButton(SITEKEY_REMOVE));
  el.append(createSitekeyButton(SITEKEY_ADD));

  return el;
}

function createSitekeyPart(urlpart) {
  const part = document.createElement("div");
  const span = document.createElement("span");

  if (urlpart === "pattern") {
    span.textContent = "Sitekey Pattern";
  } else {
    span.textContent = `${urlpart}:`;
  }

  part.dataset.partId = urlpart;
  part.className = SITEKEY_PART;
  part.append(span);
  part.append(createSitekeyRow(urlpart));

  return part;
}

function createSitekeyPattern() {
  const el = document.createElement("div");
  el.className = SITEKEY_PATTERN;
  el.append(createSitekeyPart("pattern"));
  el.append(createSitekeyPart("hostname"));
  el.append(createSitekeyPart("pathname"));
  el.append(createSitekeyPart("search"));

  return el;
}

function addSitekeyNodeAfter(node) {
  let insertNode;

  if (node.classList.contains(SITEKEY_ROW)) {
    insertNode = createSitekeyRow(node.closest(`.${SITEKEY_PART}`).dataset.partId);
  } else {
    insertNode = createSitekeyPattern();
  }

  node.after(insertNode);
  updateSitekeyDisabledStates();
  insertNode.querySelector("input").focus();
}

function removeSitekeyNode(node) {
  const {nextElementSibling, previousElementSibling} = node;

  node.remove();
  updateSitekeyDisabledStates();

  if (nextElementSibling) {
    enabledSitekeyFormElementsIn(nextElementSibling).item(0).focus();
  } else {
    [...enabledSitekeyFormElementsIn(previousElementSibling)].at(-1).focus();
  }
}

function onClickSitekeyButton(event) {
  const button = event.target;
  const isPattern = button.closest(`.${SITEKEY_PART}`).dataset.partId === "pattern";
  const node = button.closest(isPattern ? `.${SITEKEY_PATTERN}` : `.${SITEKEY_ROW}`);

  if (button.dataset.btnId === SITEKEY_REMOVE) {
    removeSitekeyNode(node);
  } else {
    addSitekeyNodeAfter(node);
  }
}

async function resetPermissionsUi() {
  await maybeShowPermissionsWarningIcon();
  await setUpCheckBoxes();
  enablePermissionsInputs();
}

browser.permissions.onAdded.addListener(resetPermissionsUi);
browser.permissions.onRemoved.addListener(resetPermissionsUi);

document.addEventListener("DOMContentLoaded", setupOptions);
document.querySelector("#syncCheck").addEventListener( "change", enableDisableSync);
document.querySelector("#replaceTabCheck").addEventListener( "change", enableDisableReplaceTab);
document.querySelector("#changeTheme").addEventListener( "change", changeTheme);

maybeShowPermissionsWarningIcon();
for (let i=0; i < NUMBER_OF_KEYBOARD_SHORTCUTS; i++) {
  document.querySelector("#open_container_"+i)
    .addEventListener("change", storeShortcutChoice);
}

document.querySelectorAll(`.${SITEKEY_PATTERN} input`).forEach(registerSitekeyInput);

document.querySelectorAll("[data-btn-id]").forEach(btn => {
  btn.addEventListener("click", (event) => {
    switch (btn.dataset.btnId) {
    case "reset-onboarding":
      resetOnboarding();
      break;
    case "moz-vpn-learn-more":
      browser.tabs.create({
        url: MozillaVPN.attachUtmParameters("https://support.mozilla.org/kb/protect-your-container-tabs-mozilla-vpn", "options-learn-more")
      });
      break;
    case SITEKEY_REMOVE:
    case SITEKEY_ADD:
      onClickSitekeyButton(event);
      break;
    }
  });
});
resetPermissionsUi();
