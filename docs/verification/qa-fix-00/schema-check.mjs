import { getSchema, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import fs from 'node:fs';
// Same structural definitions and options as src/Editor.tsx; React node views
// and rendering callbacks do not affect ProseMirror content validation.
const AttachmentNode=Node.create({name:'attachment',group:'block',atom:true,draggable:true,
  addAttributes(){return {id:{default:''},name:{default:'附件'},kind:{default:'file'}};}});
const DrawingNode=Node.create({name:'drawing',group:'block',atom:true,draggable:true,
  addAttributes(){return {strokes:{default:[]}};}});
const schema=getSchema([StarterKit.configure({heading:{levels:[1,2,3]},link:{openOnClick:false}}),
  TaskList,TaskItem.configure({nested:true}),TableKit.configure({table:{resizable:true}}),
  Highlight.configure({multicolor:true}),TextStyle,Color,AttachmentNode,DrawingNode,
  Placeholder.configure({placeholder:''})]);
const archive=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const document=archive.notes[0].document;
try {
  schema.nodeFromJSON(document).check();
  console.log(JSON.stringify({schemaAccepted:true}));
} catch(e) {
  console.log(JSON.stringify({schemaAccepted:false,error:e.message}));
}
