# 固定源片段

行号属于input-manifest中的App/style；未读取活动smart-folders.css。

## src/App.tsx 259–290

```text
259: function IconButton({
260:   label,
261:   children,
262:   onClick,
263:   active,
264:   disabled,
265:   className = "",
266: }: {
267:   label: string;
268:   children: ReactNode;
269:   onClick?: () => void;
270:   active?: boolean;
271:   disabled?: boolean;
272:   className?: string;
273: }) {
274:   return (
275:     <button
276:       type="button"
277:       aria-label={label}
278:       title={label}
279:       className={`icon-button ${active ? "active" : ""} ${className}`}
280:       onClick={onClick}
281:       disabled={disabled}
282:     >
283:       {children}
284:     </button>
285:   );
286: }
287: function MenuRow({
288:   children,
289:   icon,
290:   onClick,
```

## src/App.tsx 4104–4120

```text
4104:         <div className="folder-footer">
4105:           <button
4106:             aria-label="新建文件夹"
4107:             onClick={() => openModal("newFolder")}
4108:           >
4109:             {mobile ? <MobileAddFolderIcon /> : <FolderPlus size={21} />}
4110:             {!mobile && "新建文件夹"}
4111:           </button>
4112:           <IconButton
4113:             label={mobile ? "新建备忘录" : "更多设置"}
4114:             onClick={
4115:               mobile ? newNote : () => setMenu(menu === "app" ? null : "app")
4116:             }
4117:           >
4118:             {mobile ? <SquarePen /> : <MoreHorizontal />}
4119:           </IconButton>
4120:         </div>
```

## src/style.css 138–165

```text
138: .icon-button {
139:   width: 36px;
140:   height: 36px;
141:   display: inline-flex;
142:   align-items: center;
143:   justify-content: center;
144:   border-radius: 8px;
145:   flex-shrink: 0;
146:   transition: background 0.1s;
147: }
148: .icon-button:hover {
149:   background: rgba(128, 128, 128, 0.1);
150: }
151: .icon-button svg {
152:   width: 21px;
153:   height: 21px;
154: }
155: .icon-button.active {
156:   color: var(--accent);
157:   background: rgba(128, 128, 128, 0.1);
158: }
159: .sidebar-toolbar .icon-button {
160:   width: 35px;
161:   height: 34px;
162: }
163: .sidebar-toolbar .icon-button svg {
164:   width: 23px;
165:   height: 23px;
```

## src/style.css 255–278

```text
255: .folder-footer {
256:   height: 35px;
257:   display: flex;
258:   align-items: center;
259:   justify-content: space-between;
260:   padding: 0 8px;
261:   flex-shrink: 0;
262: }
263: .folder-footer > button {
264:   display: flex;
265:   align-items: center;
266:   gap: 7px;
267:   color: var(--secondary);
268:   font-size: 12px;
269: }
270: .folder-footer > button:hover {
271:   color: var(--ink);
272: }
273: .folder-footer .icon-button {
274:   width: 27px;
275:   height: 27px;
276: }
277: .folder-large-title,
278: .mobile-folder-nav,
```

## src/style.css 1980–2018

```text
1980:   }
1981:   .mobile .account-title {
1982:     font-size: 19px;
1983:     color: var(--ink);
1984:     padding: 26px 17px 11px;
1985:     font-weight: 650;
1986:   }
1987:   .mobile .folder-footer {
1988:     height: 52px;
1989:     padding: 0 17px env(safe-area-inset-bottom, 0);
1990:     background: rgba(248, 248, 250, 0.94);
1991:     flex-shrink: 0;
1992:   }
1993:   .mobile .folder-footer > button {
1994:     color: var(--accent);
1995:   }
1996:   .mobile.page-folders .folder-footer > button:first-child {
1997:     position: relative;
1998:   }
1999:   .mobile.page-folders .folder-footer > button:first-child::before {
2000:     content: "";
2001:     position: absolute;
2002:     inset: 0 -10px 0 0;
2003:   }
2004:   .mobile .folder-footer .icon-button {
2005:     height: 35px;
2006:     width: 30px;
2007:   }
2008:   .mobile .folder-footer svg {
2009:     height: 24px;
2010:     width: 24px;
2011:     stroke-width: 1.4;
2012:   }
2013:   .mobile .notes-pane {
2014:     background: var(--grouped);
2015:     padding-top: env(safe-area-inset-top, 0);
2016:   }
2017:   .mobile .notes-header {
2018:     height: 42px;
```

## src/style.css 2132–2152

```text
2132:   .mobile .note-folder {
2133:     font-size: 12px;
2134:     margin-top: 5px;
2135:   }
2136:   .mobile .notes-footer {
2137:     height: 52px;
2138:     padding-bottom: env(safe-area-inset-bottom, 0);
2139:     display: flex;
2140:     background: rgba(249, 249, 251, 0.95);
2141:     font-size: 11px;
2142:   }
2143:   .mobile .notes-footer .icon-button {
2144:     width: 35px;
2145:     height: 38px;
2146:   }
2147:   .mobile .notes-footer .icon-button svg {
2148:     width: 25px;
2149:     height: 25px;
2150:   }
2151:   .mobile .editor-pane {
2152:     background-color: var(--paper);
```

## node_modules/lucide-react/dist/esm/icons/square-pen.js

```javascript
/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */

import createLucideIcon from '../createLucideIcon.js';

const SquarePen = createLucideIcon("SquarePen", [
  ["path", { d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", key: "1m0v6g" }],
  [
    "path",
    {
      d: "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",
      key: "ohrbg2"
    }
  ]
]);

export { SquarePen as default };
//# sourceMappingURL=square-pen.js.map

```

## node_modules/lucide-react/dist/esm/createLucideIcon.js

```javascript
/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */

import { forwardRef, createElement } from 'react';
import { mergeClasses, toKebabCase } from './shared/src/utils.js';
import Icon from './Icon.js';

const createLucideIcon = (iconName, iconNode) => {
  const Component = forwardRef(
    ({ className, ...props }, ref) => createElement(Icon, {
      ref,
      iconNode,
      className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
      ...props
    })
  );
  Component.displayName = `${iconName}`;
  return Component;
};

export { createLucideIcon as default };
//# sourceMappingURL=createLucideIcon.js.map

```

## node_modules/lucide-react/dist/esm/Icon.js

```javascript
/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */

import { forwardRef, createElement } from 'react';
import defaultAttributes from './defaultAttributes.js';
import { mergeClasses } from './shared/src/utils.js';

const Icon = forwardRef(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => {
    return createElement(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size,
        height: size,
        stroke: color,
        strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
        className: mergeClasses("lucide", className),
        ...rest
      },
      [
        ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

export { Icon as default };
//# sourceMappingURL=Icon.js.map

```

## node_modules/lucide-react/dist/esm/defaultAttributes.js

```javascript
/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */

var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

export { defaultAttributes as default };
//# sourceMappingURL=defaultAttributes.js.map

```
