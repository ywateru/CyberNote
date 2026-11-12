// Browser-only test fixture. Vite resolves the same React instances as App.
import React from "react";
import { createRoot } from "react-dom/client";
import { MenuSurface, MenuItem, MenuSubmenu } from "../../src/Menu";
export function mount() {
  const app=document.querySelector<HTMLElement>(".app")!, host=document.createElement("div"), modal=document.createElement("section"), trigger=document.createElement("button"), preview=document.createElement("section"), cover=document.createElement("div");
  modal.className="modal-backdrop";trigger.textContent="modal anchor";modal.append(trigger);app.append(modal,host);preview.className="image-preview";cover.className="access-cover";app.append(preview,cover);cover.style.display="none";
  const root=createRoot(host);let clicked=false;
  root.render(<>
    <MenuSurface anchor={trigger} autoFocus={false} dismissOnOutside={false} onClose={()=>{}} aria-label="design modal menu"><MenuItem>Modal action</MenuItem></MenuSurface>
    <MenuSurface point={{x:16,y:120}} autoFocus={false} dismissOnOutside={false} onClose={()=>{}} aria-label="design ordinary menu">
      <MenuSubmenu label="Design move">{Array.from({length:18},(_,i)=><MenuItem key={i} onClick={()=>{clicked=true;}}>Destination {i}</MenuItem>)}</MenuSubmenu>
    </MenuSurface>
  </>);
  return {clicked:()=>clicked,cleanup:()=>{root.unmount();modal.remove();host.remove();preview.remove();cover.remove();app.classList.remove("access-sync");}};
}
