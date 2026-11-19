import type { Settings } from "../types";
import { presentationOf, parsePresentation, withNavigation, type NavigationLayout, type CollectionView, type Density } from "./model";

export default function PreferencesPresentation({ settings, save }: { settings: Settings; save(patch: Settings): void }) {
  const p = presentationOf(settings);
  const change = (device: "desktop" | "mobile", key: "density" | "collectionView", value: string) =>
    save({ presentation: parsePresentation({ ...p, [device]: { ...p[device], [key]: value } }) });
  return <>
    <div className="preferences-group"><h4>桌面布局</h4>
      <label className="preferences-row"><span>导航布局<small>专注仅显示正文；退出时恢复上次布局</small></span><select aria-label="桌面导航布局" value={p.desktop.navigation} onChange={e => save({ presentation: withNavigation(p, e.target.value as NavigationLayout) })}>
        <option value="three-pane">三栏</option><option value="two-pane">两栏</option><option value="focus">专注</option>
      </select></label>
      <label className="preferences-row"><span>桌面显示方式</span><select aria-label="桌面显示方式" value={p.desktop.collectionView} onChange={e => change("desktop", "collectionView", e.target.value as CollectionView)}><option value="list">列表</option><option value="gallery">画廊</option></select></label>
      <label className="preferences-row"><span>桌面密度</span><select aria-label="桌面密度" value={p.desktop.density} onChange={e => change("desktop", "density", e.target.value as Density)}><option value="compact">紧凑</option><option value="standard">标准</option><option value="comfortable">舒适</option></select></label>
    </div>
    <div className="preferences-group"><h4>手机首页</h4>
      <label className="preferences-row"><span>手机显示方式<small>手机与桌面分别保存</small></span><select aria-label="手机显示方式" value={p.mobile.collectionView} onChange={e => change("mobile", "collectionView", e.target.value as CollectionView)}><option value="gallery">画廊</option><option value="list">列表</option></select></label>
      <label className="preferences-row"><span>手机密度</span><select aria-label="手机密度" value={p.mobile.density} onChange={e => change("mobile", "density", e.target.value as Density)}><option value="standard">标准</option><option value="comfortable">舒适</option></select></label>
      <p className="preferences-help">手机与桌面分别保存；密度调整留白，字号和界面细节保留各自设置。</p>
    </div>
  </>;
}
