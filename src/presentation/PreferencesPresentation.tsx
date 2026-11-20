import type { Settings } from "../types";
import { PreferenceSegments } from "../preferences-menu/PreferenceSegments";
import { presentationOf, parsePresentation, withNavigation, type NavigationLayout } from "./model";

export default function PreferencesPresentation({ settings, save, disabled = false, mobile }: {
  settings: Settings; save(patch: Settings): void; disabled?: boolean; mobile: boolean;
}) {
  const p = presentationOf(settings);
  const change = (device: "desktop" | "mobile", key: "density" | "collectionView", value: string) =>
    save({ presentation: parsePresentation({ ...p, [device]: { ...p[device], [key]: value } }) });
  const desktop = <div className="preferences-group"><h4>桌面布局</h4>
      <div className="preferences-row"><span>导航布局<small>专注仅显示正文，退出时恢复上次布局</small></span><PreferenceSegments label="桌面导航布局" disabled={disabled} value={p.desktop.navigation} options={[{value:"three-pane",label:"三栏"},{value:"two-pane",label:"两栏"},{value:"focus",label:"专注"}]} onChange={value => save({ presentation: withNavigation(p, value as NavigationLayout) })} /></div>
      <div className="preferences-row"><span>桌面显示方式</span><PreferenceSegments label="桌面显示方式" disabled={disabled} value={p.desktop.collectionView} options={[{value:"list",label:"列表"},{value:"gallery",label:"画廊"}]} onChange={value => change("desktop", "collectionView", value)} /></div>
      <div className="preferences-row"><span>桌面密度</span><PreferenceSegments label="桌面密度" disabled={disabled} value={p.desktop.density} options={[{value:"compact",label:"紧凑"},{value:"standard",label:"标准"},{value:"comfortable",label:"舒适"}]} onChange={value => change("desktop", "density", value)} /></div>
    </div>;
  const phone = <div className="preferences-group"><h4>手机首页</h4>
      <div className="preferences-row"><span>手机显示方式</span><PreferenceSegments label="手机显示方式" disabled={disabled} value={p.mobile.collectionView} options={[{value:"gallery",label:"画廊"},{value:"list",label:"列表"}]} onChange={value => change("mobile", "collectionView", value)} /></div>
      <div className="preferences-row"><span>手机密度</span><PreferenceSegments label="手机密度" disabled={disabled} value={p.mobile.density} options={[{value:"standard",label:"标准"},{value:"comfortable",label:"舒适"}]} onChange={value => change("mobile", "density", value)} /></div>
    </div>;
  const current = mobile ? phone : desktop;
  const secondary = mobile ? desktop : phone;
  const secondaryTitle = mobile ? "桌面布局" : "手机首页";
  return <>
    {current}
    <details className="preferences-device-disclosure">
      <summary>{secondaryTitle}<span>{mobile ? "仅在桌面端使用" : "仅在手机端使用"}</span></summary>
      {secondary}
    </details>
  </>;
}
