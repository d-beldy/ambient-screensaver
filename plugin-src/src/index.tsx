import { useEffect, useState } from "react";
import { staticClasses, PanelSection, PanelSectionRow, ToggleField, SliderField, DropdownItem } from "@decky/ui";
import { definePlugin, callable } from "@decky/api";

interface Settings {
  mode: "ambient" | "letterbox";
  scope: "recent" | "all";
  duration: number;
  transitionDuration: number;
  logoAlign: "left" | "center" | "right";
}

const LOGO_ALIGN_OPTIONS = [
  { data: "left", label: "Left" },
  { data: "center", label: "Center" },
  { data: "right", label: "Right" },
];

const getSettings = callable<[], Settings>("get_settings");
const setSettings = callable<[Partial<Settings>], void>("set_settings");

function Content() {
  const [settings, setLocalSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setLocalSettings).catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return <div style={{ padding: "8px", color: "red" }}>{error}</div>;
  }
  if (!settings) {
    return <div style={{ padding: "8px" }}>Loading…</div>;
  }

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setLocalSettings(next);
    setSettings(patch);
  };

  return (
    <PanelSection title="Ambient Screensaver">
      <PanelSectionRow>
        <ToggleField
          label="Ambient color"
          description="Glow behind the banner matches its colors, instead of plain black"
          checked={settings.mode === "ambient"}
          onChange={(checked) => update({ mode: checked ? "ambient" : "letterbox" })}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Whole library"
          description="Rotate every game with cached art, instead of just the 20 most recent"
          checked={settings.scope === "all"}
          onChange={(checked) => update({ scope: checked ? "all" : "recent" })}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label="Duration"
          description="Seconds each banner stays on screen"
          value={settings.duration}
          min={5}
          max={60}
          step={1}
          showValue
          valueSuffix="s"
          onChange={(value) => update({ duration: value })}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label="Transition"
          description="Crossfade duration between banners"
          value={settings.transitionDuration}
          min={0.5}
          max={5}
          step={0.5}
          showValue
          valueSuffix="s"
          onChange={(value) => update({ transitionDuration: value })}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <DropdownItem
          label="Logo position"
          rgOptions={LOGO_ALIGN_OPTIONS}
          selectedOption={settings.logoAlign}
          onChange={(option) => update({ logoAlign: option.data })}
        />
      </PanelSectionRow>
    </PanelSection>
  );
}

export default definePlugin(() => {
  return {
    name: "Screensaver Ambient Color",
    titleView: <div className={staticClasses.Title}>Ambient Screensaver</div>,
    content: <Content />,
    icon: <div />,
  };
});
