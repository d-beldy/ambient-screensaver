const manifest = {"name":"Screensaver Ambient Color"};
const API_VERSION = 2;
const internalAPIConnection = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
if (!internalAPIConnection) {
    throw new Error('[@decky/api]: Failed to connect to the loader as as the loader API was not initialized. This is likely a bug in Decky Loader.');
}
let api;
try {
    api = internalAPIConnection.connect(API_VERSION, manifest.name);
}
catch {
    api = internalAPIConnection.connect(1, manifest.name);
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version 1. Some features may not work.`);
}
if (api._version != API_VERSION) {
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version ${api._version}. Some features may not work.`);
}
const callable = api.callable;
const definePlugin = (fn) => {
    return (...args) => {
        return fn(...args);
    };
};

const LOGO_ALIGN_OPTIONS = [
    { data: "left", label: "Left" },
    { data: "center", label: "Center" },
    { data: "right", label: "Right" },
];
const getSettings = callable("get_settings");
const setSettings = callable("set_settings");
function Content() {
    const [settings, setLocalSettings] = SP_REACT.useState(null);
    const [error, setError] = SP_REACT.useState(null);
    SP_REACT.useEffect(() => {
        getSettings().then(setLocalSettings).catch((e) => setError(String(e)));
    }, []);
    if (error) {
        return SP_JSX.jsx("div", { style: { padding: "8px", color: "red" }, children: error });
    }
    if (!settings) {
        return SP_JSX.jsx("div", { style: { padding: "8px" }, children: "Loading\u2026" });
    }
    const update = (patch) => {
        const next = { ...settings, ...patch };
        setLocalSettings(next);
        setSettings(patch);
    };
    return (SP_JSX.jsxs(DFL.PanelSection, { title: "Ambient Screensaver", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: "Ambient color", description: "Glow behind the banner matches its colors, instead of plain black", checked: settings.mode === "ambient", onChange: (checked) => update({ mode: checked ? "ambient" : "letterbox" }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: "Whole library", description: "Rotate every game with cached art, instead of just the 20 most recent", checked: settings.scope === "all", onChange: (checked) => update({ scope: checked ? "all" : "recent" }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.SliderField, { label: "Duration", description: "Seconds each banner stays on screen", value: settings.duration, min: 5, max: 60, step: 1, showValue: true, valueSuffix: "s", onChange: (value) => update({ duration: value }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.SliderField, { label: "Transition", description: "Crossfade duration between banners", value: settings.transitionDuration, min: 0.5, max: 5, step: 0.5, showValue: true, valueSuffix: "s", onChange: (value) => update({ transitionDuration: value }) }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.DropdownItem, { label: "Logo position", rgOptions: LOGO_ALIGN_OPTIONS, selectedOption: settings.logoAlign, onChange: (option) => update({ logoAlign: option.data }) }) })] }));
}
var index = definePlugin(() => {
    return {
        name: "Screensaver Ambient Color",
        titleView: SP_JSX.jsx("div", { className: DFL.staticClasses.Title, children: "Ambient Screensaver" }),
        content: SP_JSX.jsx(Content, {}),
        icon: SP_JSX.jsx("div", {}),
    };
});

export { index as default };
//# sourceMappingURL=index.js.map
