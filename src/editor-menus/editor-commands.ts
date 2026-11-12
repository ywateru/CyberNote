import type { Editor } from "@tiptap/core";
import type { MenuCommand } from "../native-toolbar";
import {
  convertTableToText,
  convertTextToTable,
  toggleListStyle,
} from "../editor-actions";
/** Pure semantic directory shared by web controls and native intents. Callers
 * retain their live target, bookmark and authorization checks before invoking. */
export function executeEditorCommand(
  editor: Editor,
  command: MenuCommand,
): boolean {
  switch (command) {
    case "bold":
      return editor.commands.toggleBold();
    case "italic":
      return editor.commands.toggleItalic();
    case "underline":
      return editor.commands.toggleUnderline();
    case "strikethrough":
      return editor.commands.toggleStrike();
    case "highlight":
      return editor.commands.toggleHighlight({ color: "#e8c1f0" });
    case "colorDefault":
      return editor.commands.unsetHighlight();
    case "styleTitle":
      return editor.commands.setHeading({ level: 1 });
    case "styleHeading":
      return editor.commands.setHeading({ level: 2 });
    case "styleSubheading":
      return editor.commands.setHeading({ level: 3 });
    case "styleBody":
      return editor.commands.setParagraph();
    case "styleMonospaced":
      return editor.commands.toggleCodeBlock();
    case "listBullet":
      return toggleListStyle(editor, "bullet");
    case "listDash":
      return toggleListStyle(editor, "dash");
    case "listNumber":
      return editor.commands.toggleOrderedList();
    case "blockquote":
      return editor.commands.toggleBlockquote();
    case "convertTextToTable":
      return convertTextToTable(editor);
    case "convertTableToText":
      return convertTableToText(editor);
    case "colorPurple":
      return editor.commands.setHighlight({ color: "#e8c1f0" });
    case "colorPink":
      return editor.commands.setHighlight({ color: "#f6bfd4" });
    case "colorOrange":
      return editor.commands.setHighlight({ color: "#fac69c" });
    case "colorMint":
      return editor.commands.setHighlight({ color: "#b3dfbd" });
    case "colorBlue":
      return editor.commands.setHighlight({ color: "#bad6f3" });
    default:
      throw Error("此编辑命令尚未实现");
  }
}
