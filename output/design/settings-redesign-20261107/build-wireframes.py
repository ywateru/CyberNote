from pathlib import Path
from html import escape
OUT=Path(__file__).parent
INK='#1D1D1F'; SECOND='#6E6E73'; LINE='#E5E5EA'; GRAY='#F5F5F7'; NAV='#F0F0F3'; AMBER='#C78600'; SELECT='#FFF0C7'
class Board:
 def __init__(self,w,h):
  self.parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#000" flood-opacity=".14"/></filter></defs>']
 def rect(self,x,y,w,h,fill='white',r=0,stroke='none',extra=''):
  self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" {extra}/>')
 def text(self,x,y,s,size=14,color=INK,weight=400,anchor='start'):
  self.parts.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="PingFang SC, sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{escape(s)}</text>')
 def line(self,x,y,x2,y2,color=LINE): self.parts.append(f'<path d="M{x} {y}H{x2}" stroke="{color}"/>' if y==y2 else f'<path d="M{x} {y}L{x2} {y2}" stroke="{color}"/>')
 def path(self,d,color=INK,width=1.7): self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>')
 def circle(self,x,y,r,fill): self.parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>')
 def chevron(self,x,y,color=SECOND): self.path(f'M{x} {y-4}l4 4-4 4',color)
 def icon(self,x,y,kind,color=SECOND):
  paths={'appearance':'M2 4h16v12H2z M7 4v12 M11 8h4 M11 12h3', 'notes':'M4 2h12v16H4z M7 7h6 M7 11h6', 'sync':'M3 8a7 7 0 0 1 12-3l2 2 M17 2v5h-5 M17 12a7 7 0 0 1-12 3l-2-2 M3 18v-5h5', 'storage':'M3 3h14v14H3z M3 12h14 M12 15h2', 'backup':'M4 7v10h12V7 M10 12V2 M6 6l4-4 4 4', 'folder':'M2 6V3h6l2 3h8v12H2z', 'phone':'M6 1h9v18H6z M9 16h3', 'check':'M4 10l4 4 8-8', 'close':'M5 5l10 10 M15 5L5 15'}
  self.parts.append(f'<g transform="translate({x} {y})">')
  self.path(paths[kind],color)
  self.parts.append('</g>')
 def button(self,x,y,w,label,active=False):
  self.rect(x,y,w,32,SELECT if active else GRAY,7,AMBER if active else LINE)
  self.text(x+w/2,y+21,label,13,AMBER if active else INK,500,'middle')
 def segments(self,x,y,w,selected,mobile=False):
  self.rect(x,y,w,48 if mobile else 34,GRAY,8)
  labels=['极小','小','中','大','极大']; step=w/5
  for i,label in enumerate(labels):
   if i==selected:self.rect(x+i*step+2,y+2,step-4,44 if mobile else 30,'white',6,LINE)
   self.text(x+(i+.5)*step,y+31 if mobile else y+22,label,14 if mobile else 13,AMBER if i==selected else SECOND,600 if i==selected else 400,'middle')
 def save(self,name): (OUT/(name+'.svg')).write_text(''.join(self.parts)+'</svg>')

def desktop(active):
 b=Board(1440,1000); b.rect(0,0,1440,1000,'#E9EAEE'); b.rect(24,24,1392,930,'white',16,LINE)
 b.rect(24,24,1392,76,'#F4F4F6',16); b.rect(24,80,1392,20,'#F4F4F6'); b.line(24,100,1416,100)
 # Real window controls only in main chrome.
 for i,c in enumerate(['#FF6058','#FFBD2E','#28C840']): b.circle(48+i*22,61,6,c)
 b.icon(141,50,'appearance','#8D8D92'); b.icon(188,50,'folder','#8D8D92'); b.line(229,24,229,100)
 b.text(252,56,'全部备忘录',15,'#7C7C82',600); b.text(252,78,'12 个备忘录',12,'#949499')
 b.text(462,67,'•••',18,'#8D8D92'); b.line(505,43,505,81)
 b.icon(527,50,'notes','#8D8D92'); b.text(581,66,'格式',14,'#8D8D92')
 for x,k in [(647,'check'),(700,'storage'),(753,'backup'),(807,'sync')]:b.icon(x,50,k,'#8D8D92')
 b.text(874,66,'#',23,'#8D8D92');b.text(925,64,'•••',18,'#8D8D92')
 b.rect(1060,44,260,34,'#FAFAFC',17,LINE); b.circle(1078,59,5,'none'); b.path('M1075 56a5 5 0 1 1 0 1 M1083 64l4 4','#A1A1A6'); b.text(1098,66,'搜索备忘录',13,'#A1A1A6'); b.text(1360,66,'⚙',22,'#949499')
 b.rect(24,101,205,853,'#F5F5F7');b.line(229,101,229,954);b.line(555,101,555,954)
 for i,label in enumerate(['快速备忘录','全部备忘录','工作项目','生活记录','最近删除']):b.text(61,155+i*49,label,14,SECOND)
 b.text(252,142,'今天',14,SECOND);b.text(252,190,'产品设计备忘',16,INK,600);b.text(252,219,'让记录更自然，让灵感有所安放。',13,SECOND)
 b.text(598,173,'产品设计备忘',24,INK,600);b.text(598,217,'记录今天的想法。',15,SECOND)
 # Dim only content, never the original toolbar.
 b.rect(24,101,1392,853,'#E5E6EB',0,extra='fill-opacity=".60"')
 b.rect(260,170,920,660,'white',16,LINE,extra='filter="url(#shadow)"');b.rect(260,170,196,660,NAV,16);b.rect(440,170,16,660,NAV)
 b.text(284,205,'设置',17,INK,600);b.icon(1141,185,'close',SECOND);b.line(456,170,456,830)
 labels=['外观与字号','备忘录','设备同步','存储空间','导入与备份'];icons=['appearance','notes','sync','storage','backup']
 for i,(label,icon) in enumerate(zip(labels,icons)):
  y=246+i*46
  if i==active:b.rect(272,y,172,38,SELECT,7)
  b.icon(284,y+8,icon,AMBER if i==active else SECOND);b.text(315,y+25,label,14,AMBER if i==active else INK,600 if i==active else 400)
 b.text(284,797,'CyberNote',13,SECOND,500)
 b.text(492,263,labels[active],22,INK,600)
 b.text(36,983,'设计线框 · 示意内容 · 尚未实现',12,SECOND)
 return b

b=desktop(0)
b.text(492,303,'外观',14,INK,600)
for i,(label,bg) in enumerate([('跟随系统',GRAY),('浅色','#FFFFFF'),('深色','#29292D')]):
 x=492+i*214;b.rect(x,319,198,70,bg,8,AMBER if i==0 else LINE)
 b.rect(x+12,330,38,25,'#E1E1E7' if i!=2 else '#444449',3)
 b.rect(x+52,330,131,25,'white' if i!=2 else '#1C1C1E',3)
 b.text(x+99,377,label,13,'#FFFFFF' if i==2 else INK,500,'middle')
b.text(492,432,'界面字号',14,INK,600);b.text(1132,432,'小',13,SECOND,400,'end')
b.segments(492,447,626,1); b.rect(492,495,626,46,GRAY,7);b.icon(507,507,'folder',SECOND);b.text(538,523,'工作项目',13);b.text(1102,523,'12 个备忘录',12,SECOND,400,'end')
b.line(492,561,1118,561);b.text(492,593,'编辑器字号',14,INK,600);b.text(1132,593,'中',13,SECOND,400,'end');b.segments(492,608,626,2)
b.rect(492,656,626,83,GRAY,7);b.text(508,684,'让记录更自然',17,INK,600);b.text(508,716,'把想法写下来，留给下一次灵感。',16)
b.text(492,782,'更改立即生效',12,SECOND);b.save('desktop-appearance')

b=desktop(2)
b.circle(499,303,4,'#35A366');b.text(512,309,'已连接',14,INK,500);b.text(492,335,'最近成功同步：今天 10:28',13,SECOND)
b.button(916,294,96,'立即同步');b.button(1022,294,96,'停止同步');b.line(492,360,1118,360)
b.text(492,393,'本机',13,SECOND);b.text(1118,393,'我的 Mac',14,INK,400,'end')
b.text(492,437,'已配对设备',14,INK,600);b.icon(507,463,'phone',SECOND);b.text(542,474,'我的手机',14,INK,500);b.text(542,498,'已连接 · 今天 10:28',12,SECOND);b.text(1097,482,'•••',17,SECOND)
b.line(492,518,1118,518)
for i,label in enumerate(['添加设备','更新连接']):
 y=550+i*47;b.text(507,y,label,14);b.chevron(1098,y-5)
b.line(492,622,1118,622);b.text(492,656,'需要处理',14,INK,600);b.text(507,693,'冲突版本',14);b.text(1080,693,'0 项',13,SECOND,400,'end');b.chevron(1098,688)
b.line(492,720,1118,720);b.chevron(498,758);b.text(518,763,'连接详情',13,SECOND);b.save('desktop-sync')

b=Board(1400,1040);b.rect(0,0,1400,1040,'#EDEEF1');b.text(60,45,'CyberNote · 移动设置',23,INK,600);b.text(1340,44,'设计线框 / 示意数据 / 尚未实现',12,SECOND,400,'end')
def phone(x,title,back=False):
 y=91;b.rect(x,y,390,844,'#F5F5F7',12,LINE);b.rect(x,y,390,115,'white',12);b.rect(x,y+100,390,15,'white');b.text(x+22,y+27,'9:41',13,INK,600);b.text(x+367,y+27,'▰',14,INK,400,'end')
 if back:
  b.path(f'M{x+28} {y+60}l-6 6 6 6',AMBER);b.text(x+37,y+72,'设置',16,AMBER);b.text(x+195,y+73,title,17,INK,600,'middle')
 else:b.text(x+24,y+85,title,28,INK,600);b.text(x+366,y+82,'完成',16,AMBER,500,'end')
 b.rect(x+135,y+825,120,4,'#2C2C2E',2)
 return y

def row(x,y,label,value='',icon=None,last=False):
 if icon:b.icon(x+16,y+17,icon,SECOND)
 b.text(x+(48 if icon else 16),y+33,label,16)
 if value:b.text(x+306,y+33,value,14,SECOND,400,'end')
 b.chevron(x+327,y+27)
 if not last:b.line(x+(48 if icon else 16),y+54,x+344,y+54)

y=phone(60,'设置');x=60
b.text(x+25,y+148,'阅读与记录',12,SECOND);b.rect(x+16,y+163,358,110,'white',10)
row(x+16,y+163,'外观与字号','跟随系统','appearance');row(x+16,y+218,'备忘录','编辑日期','notes',True)
b.text(x+25,y+310,'数据与设备',12,SECOND);b.rect(x+16,y+326,358,165,'white',10)
row(x+16,y+326,'设备同步','未开启','sync');row(x+16,y+381,'存储空间','1.24 GB','storage');row(x+16,y+436,'导入与备份','','backup',True)
b.text(x+25,y+527,'备忘录和附件保存在此设备中。',13,SECOND)

x=505;y=phone(x,'外观与字号',True)
b.rect(x+16,y+135,358,56,'white',10);row(x+16,y+135,'外观','跟随系统',last=True)
b.text(x+24,y+232,'界面字号',16,INK,600);b.text(x+366,y+232,'小',14,SECOND,400,'end')
b.segments(x+16,y+249,358,1,True);b.rect(x+16,y+315,358,62,'white',10);b.icon(x+30,y+334,'folder');b.text(x+61,y+338,'工作项目',14,INK,500);b.text(x+61,y+360,'12 个备忘录',12,SECOND)
b.text(x+24,y+414,'编辑器字号',16,INK,600);b.text(x+366,y+414,'中',14,SECOND,400,'end')
b.segments(x+16,y+431,358,2,True);b.rect(x+16,y+497,358,122,'white',10);b.text(x+32,y+529,'让记录更自然',18,INK,600);b.text(x+32,y+563,'把想法写下来，',16);b.text(x+32,y+591,'留给下一次灵感。',16);b.text(x+24,y+639,'更改立即生效',13,SECOND)

x=950;y=phone(x,'设备同步',True)
b.circle(x+29,y+156,4,'#99999E');b.text(x+43,y+162,'未开启',17,INK,600);b.text(x+24,y+194,'在你的设备间同步备忘录。',14,SECOND)
b.rect(x+16,y+228,358,112,'white',10);row(x+16,y+228,'加入已有同步','','sync');row(x+16,y+284,'在此设备创建同步','','storage',True)
b.text(x+24,y+378,'加入时，两端已有备忘录会合并保留。',13,SECOND)
b.text(60,985,'移动端采用首页 → 子页；同步字段在选择创建或加入后再显示。',14,SECOND)
b.save('mobile-settings')
print('Created three editable SVG wireframes.')
