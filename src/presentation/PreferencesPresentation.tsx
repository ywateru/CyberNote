import type { Settings } from "../types";
import { PreferenceSelect } from "../preferences-menu/PreferenceSelect";
import { presentationOf, parsePresentation, withNavigation, type NavigationLayout } from "./model";

export default function PreferencesPresentation({ settings, save, mobile = false, disabled = false }: {
  settings: Settings; save(patch: Settings): void; mobile?: boolean; disabled?: boolean;
}) {
  const p = presentationOf(settings);
  const change = (device: "desktop" | "mobile", key: "density" | "collectionView", value: string) =>
    save({ presentation: parsePresentation({ ...p, [device]: { ...p[device], [key]: value } }) });
  return <>
    <div className="preferences-group"><h4>桌面布局</h4>
      <div className="preferences-row"><span>导航布局<small>专注仅显示正文；退出时恢复上次布局</small></span><PreferenceSelect label="桌面导航布局" mobile={mobile} disabled={disabled} value={p.desktop.navigation} options={[{value:"three-pane",label:"三栏"},{value:"two-pane",label:"两栏"},{value:"focus",label:"专注"}]} onChange={value => save({ presentation: withNavigation(p, value as NavigationLayout) })} /></div>
      <div className="preferences-row"><span>桌面显示方式</span><PreferenceSelect label="桌面显示方式" mobile={mobile} disabled={disabled} value={p.desktop.collectionView} options={[{value:"list",label:"列表"},{value:"gallery",label:"画廊"}]} onChange={value => change("desktop", "collectionView", value)} /></div>
      <div className="preferences-row"><span>桌面密度</span><PreferenceSelect label="桌面密度" mobile={mobile} disabled={disabled} value={p.desktop.density} options={[{value:"compact",label:"紧凑"},{value:"standard",label:"标准"},{value:"comfortable",label:"舒适"}]} onChange={value => change("desktop", "density", value)} /></div>
    </div>
    <div className="preferences-group"><h4>手机首页</h4>
      <div className="preferences-row"><span>手机显示方式<small>手机与桌面分别保存</small></span><PreferenceSelect label="手机显示方式" mobile={mobile} disabled={disabled} value={p.mobile.collectionView} options={[{value:"gallery",label:"画廊"},{value:"list",label:"列表"}]} onChange={value => change("mobile", "collectionView", value)} /></div>
      <div className="preferences-row"><span>手机密度</span><PreferenceSelect label="手机密度" mobile={mobile} disabled={disabled} value={p.mobile.density} options={[{value:"standard",label:"标准"},{value:"comfortable",label:"舒适"}]} onChange={value => change("mobile", "density", value)} /></div>
      <p className="preferences-help">手机与桌面分别保存；密度调整留白，字号和界面细节保留各自设置。</p>
    </div>
  </>;
}
