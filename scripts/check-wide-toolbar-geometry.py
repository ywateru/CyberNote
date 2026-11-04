#!/usr/bin/env python3
"""Execute exact production layout methods offline with recording view ports.

No NSApplication, real NSWindow, AppKit control, GUI, Rust target or copied
layout algorithm. Both current and frozen baseline methods are compiled.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "plugins/tauri-plugin-notes-ui/macos/toolbar.m"
BASELINE = "f8bff9d"
OUTPUT = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "artifacts/wide-toolbar-geometry/run01")
disk = os.statvfs(ROOT)
if disk.f_bavail * disk.f_frsize < 2 * 1024**3:
    raise RuntimeError("Less than 2 GiB free; no geometry output started")
OUTPUT.mkdir(parents=True, exist_ok=False)
current = (ROOT / SOURCE).read_text()
baseline = subprocess.check_output(["git", "show", f"{BASELINE}:{SOURCE}"], cwd=ROOT, text=True)


def methods(source):
    start = source.index("- (CGFloat)widthFor:")
    end = source.index("- (NSDictionary *)information", start)
    selected = source[start:end]
    assert selected.count("- (CGFloat)widthFor:") == 1
    assert selected.count("- (void)layout {") == 1
    return selected


PREFIX = r'''
#import <AppKit/AppKit.h>
// These ports only record values assigned by the unmodified production methods.
@interface GeometryView : NSObject
@property NSRect frame;
@property NSRect bounds;
@property(getter=isFlipped) BOOL flipped;
@property BOOL hidden;
@property BOOL reserveTrafficLights;
@end
@implementation GeometryView @end
@interface NotesUIButton : GeometryView @end
@implementation NotesUIButton @end
@interface GeometryWindow : NSObject
@property NSView *contentView;
@property NSWindowStyleMask styleMask;
@end
@implementation GeometryWindow @end
@interface GeometryController : NSObject
@property GeometryWindow *window;
@property BOOL disposed;
@property NSDictionary *state;
@property GeometryView *root;
@property NSMutableDictionary<NSString *,GeometryView *> *groups;
@property NSMutableSet<NSString *> *layoutGroups;
@property NSMutableDictionary<NSString *,NotesUIButton *> *buttons;
@property NSMutableDictionary<NSString *,NSDictionary *> *actionStates;
@property GeometryView *search;
@property GeometryView *title;
@property GeometryView *count;
@property NSArray *overflow;
@property NSMutableDictionary *recorded;
- (void)placeGroup:(NSString *)name x:(CGFloat)x width:(CGFloat)width actions:(NSArray *)actions;
- (CGFloat)widthFor:(NSArray *)visible search:(CGFloat)searchWidth overflow:(BOOL)overflow;
- (void)layout;
@end
static NSArray *rect(NSRect r) {return @[@(r.origin.x),@(r.origin.y),@(r.size.width),@(r.size.height)];}
@implementation GeometryController
- (void)placeGroup:(NSString *)name x:(CGFloat)x width:(CGFloat)width actions:(NSArray *)actions {
    if(width>0)[self.layoutGroups addObject:name];
    self.recorded[name]=@{@"frame":rect(NSMakeRect(x,8,MAX(0,width),36)),@"actions":actions};
}
'''
SUFFIX = r'''
@end
int main(void) {@autoreleasepool {
    NSData *input=[[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile];
    NSArray *cases=[NSJSONSerialization JSONObjectWithData:input options:0 error:nil];
    NSMutableArray *results=[NSMutableArray array];
    for(NSDictionary *item in cases) {
        GeometryController *c=[GeometryController new];
        GeometryWindow *window=[GeometryWindow new];
        GeometryView *parent=[GeometryView new];
        parent.bounds=NSMakeRect(0,0,[item[@"width"] doubleValue],900);parent.flipped=YES;
        window.contentView=(id)parent;
        window.styleMask=[item[@"fullSize"] boolValue]?NSWindowStyleMaskFullSizeContentView:0;
        c.window=window;c.root=[GeometryView new];c.title=[GeometryView new];c.count=[GeometryView new];c.search=[GeometryView new];
        c.groups=[NSMutableDictionary dictionary];c.buttons=[NSMutableDictionary dictionary];c.actionStates=[NSMutableDictionary dictionary];c.recorded=[NSMutableDictionary dictionary];
        for(NSString *name in @[@"sidebar",@"back",@"view",@"new",@"edit",@"share",@"overflow",@"search",@"browse"]) c.groups[name]=[GeometryView new];
        for(NSString *action in item[@"actions"]) {c.actionStates[action]=@{};c.buttons[action]=[NotesUIButton new];}
        NSMutableDictionary *state=[@{@"layout":item[@"layout"],@"columns":@{@"sidebarVisible":item[@"sidebarVisible"],@"sidebarWidth":item[@"sidebarWidth"],@"listWidth":item[@"listWidth"]},@"folderTitle":@"搜索",@"folderCount":@0} mutableCopy];
        if([item[@"search"] isEqual:@"present"])state[@"search"]=@{@"value":@"controlled-query",@"enabled":@YES};
        else if([item[@"search"] isEqual:@"null"])state[@"search"]=NSNull.null;
        c.state=state;
        [c layout];
        NSMutableDictionary *visibility=[NSMutableDictionary dictionary];
        for(NSString *name in c.groups)visibility[name]=@(!c.groups[name].hidden);
        [results addObject:@{@"name":item[@"name"],@"groups":c.recorded,@"overflow":c.overflow,@"visibility":visibility,@"titleFrame":rect(c.title.frame),@"countFrame":rect(c.count.frame),@"titleHidden":@(c.title.hidden),@"countHidden":@(c.count.hidden),@"rootFrame":rect(c.root.frame),@"searchFieldFrame":rect(c.search.frame)}];
    }
    NSData *data=[NSJSONSerialization dataWithJSONObject:results options:NSJSONWritingPrettyPrinted|NSJSONWritingSortedKeys error:nil];
    [[NSFileHandle fileHandleWithStandardOutput] writeData:data];
    return 0;
}}
'''

ACTIONS = ["newNote", "format", "checklist", "table", "attachment", "share", "more"]
AUX = ["newFolder", "toggleSidebar", "viewOptions"]
cases = []


def case(name, **overrides):
    value = dict(name=name, width=1392, layout="threeColumn", sidebarVisible=True,
                 sidebarWidth=228, listWidth=280, actions=AUX + ACTIONS,
                 search="present", fullSize=True)
    value.update(overrides)
    cases.append(value)


for width in [700, 800, 900, 950, 1088, 1178.5, 1179, 1179.5, 1392, 1720]:
    case(f"three-sidebar-width-{width}", width=width)
for width in [800, 950.5, 951, 951.5, 1392]:
    case(f"three-no-sidebar-no-aux-{width}", width=width, sidebarVisible=False, actions=ACTIONS)
case("hidden-sidebar-actions-force-existing-overflow", sidebarVisible=False)
case("sidebar-actions-do-not-fit", sidebarWidth=100)
case("view-options-do-not-fit", listWidth=30)
case("different-list-boundary", listWidth=348)
case("without-full-size-content-view", fullSize=False)
for missing in ACTIONS:
    case(f"missing-action-{missing}", actions=AUX + [a for a in ACTIONS if a != missing])
for absent in [["newNote"], ["format", "checklist", "table", "attachment"], ["share", "more"]]:
    case("missing-group-" + "-".join(absent), actions=AUX + [a for a in ACTIONS if a not in absent])
for search in ["missing", "null"]:
    case(f"no-search-{search}", search=search)
for layout in ["galleryBrowse", "galleryExpanded", "independentNote"]:
    actions = AUX + ACTIONS + (["backToGallery"] if layout == "galleryExpanded" else [])
    if layout == "galleryBrowse":
        actions = AUX + ["newNote"]
    for sidebar in [True, False]:
        for width in [700, 1392]:
            case(f"{layout}-sidebar-{sidebar}-width-{width}", width=width, layout=layout,
                 sidebarVisible=sidebar, actions=actions)

commands = []
executions = {}
try:
    for kind, source in [("baseline", baseline), ("candidate", current)]:
        generated = OUTPUT / f"{kind}.m"
        generated.write_text(PREFIX + methods(source) + SUFFIX)
        binary = OUTPUT / kind
        command = ["xcrun", "clang", "-fobjc-arc", "-fblocks", "-mmacosx-version-min=12.0",
                   "-Wall", "-Wextra", "-Werror", "-framework", "AppKit", str(generated), "-o", str(binary)]
        compiled = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
        commands.append(dict(command=command, exitCode=compiled.returncode, stdout=compiled.stdout, stderr=compiled.stderr))
        (OUTPUT / f"{kind}-compile.json").write_text(json.dumps(commands[-1], indent=2) + "\n")
        if compiled.returncode:
            raise RuntimeError(f"{kind} offline geometry compile failed")
        run = subprocess.run([str(binary)], input=json.dumps(cases), text=True, capture_output=True)
        (OUTPUT / f"{kind}-run.json").write_text(json.dumps(dict(exitCode=run.returncode, stdout=run.stdout, stderr=run.stderr), indent=2) + "\n")
        if run.returncode:
            raise RuntimeError(f"{kind} offline geometry execution failed")
        executions[kind] = json.loads(run.stdout)

    checks = []

    def close(actual, expected):
        assert math.isclose(actual, expected, abs_tol=1e-9), (actual, expected)

    changed = []
    assert len(cases) == len(executions["baseline"]) == len(executions["candidate"])
    for config, old, new in zip(cases, executions["baseline"], executions["candidate"]):
        assert old["overflow"] == new["overflow"], config["name"]
        assert old["visibility"] == new["visibility"], config["name"]
        for key in ["titleFrame", "countFrame", "titleHidden", "countHidden", "rootFrame"]:
            assert old[key] == new[key], (config["name"], key)
        eligible = (config["layout"] == "threeColumn" and config["search"] == "present"
                    and all(a in config["actions"] for a in ACTIONS) and not old["overflow"])
        if not eligible or old["groups"]["search"]["frame"][2] <= 325:
            assert old == new, config["name"]
            checks.append(dict(name=config["name"], result="exact baseline layout preserved"))
            continue
        changed.append(config["name"])
        for group in ["new", "edit", "share"]:
            assert old["groups"][group]["actions"] == new["groups"][group]["actions"]
            assert old["groups"][group]["frame"][1:] == new["groups"][group]["frame"][1:]
        for group in ["sidebar", "view"]:
            assert old["groups"].get(group) == new["groups"].get(group)
        nf, ef, sf, qf = [new["groups"][g]["frame"] for g in ["new", "edit", "share", "search"]]
        close(nf[0], old["groups"]["new"]["frame"][0])
        close(qf[2], 325)
        close(qf[0] + qf[2], config["width"] - 8)
        close(ef[0] - nf[0] - nf[2], sf[0] - ef[0] - ef[2])
        close(qf[0] - sf[0] - sf[2], 16)
        assert ef[0] - nf[0] - nf[2] >= 18
        checks.append(dict(name=config["name"], result="cap and equal elastic gaps; stable actions/anchors/other groups"))
    assert len(changed) >= 5
    lookup = {r["name"]: r for r in executions["candidate"]}
    fill = lookup["three-sidebar-width-1392"]["groups"]
    assert fill["new"]["frame"] == [517, 8, 36, 36]
    assert fill["edit"]["frame"] == [677.5, 8, 161, 36]
    assert fill["share"]["frame"] == [963, 8, 80, 36]
    assert fill["search"]["frame"] == [1059, 8, 325, 36]
    for prefix, threshold in [("three-sidebar-width-", 1179), ("three-no-sidebar-no-aux-", 951)]:
        before, at, after = [lookup[prefix + str(v)]["groups"] for v in [threshold - .5, threshold, threshold + .5]]
        close(before["search"]["frame"][2], 324.5)
        close(at["search"]["frame"][2], 325)
        close(after["search"]["frame"][2], 325)
        close(after["edit"]["frame"][0] - at["edit"]["frame"][0], .25)
        close(after["share"]["frame"][0] - at["share"]["frame"][0], .5)
    result = dict(status="pass", checks=len(checks), results=checks, changedCases=changed, cases=cases,
                  baseline=BASELINE, productSource=SOURCE,
                  sourceSha256=hashlib.sha256(current.encode()).hexdigest(),
                  baselineSourceSha256=hashlib.sha256(baseline.encode()).hexdigest(),
                  extractedMethodSha256=hashlib.sha256(methods(current).encode()).hexdigest(),
                  baselineResults=executions["baseline"], candidateResults=executions["candidate"],
                  limits=["Exact production widthFor/layout methods; synthetic recording view/window ports and placeGroup sink.",
                          "No NSApplication, real window, AppKit control, field editor, event, GUI, device or pixel acceptance.",
                          "325 is the documented source candidate, not a measured original internal frame."])
    (OUTPUT / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"Passed {len(checks)} exact-production layout cases; {len(changed)} eligible wide cases changed.")
except Exception as error:
    (OUTPUT / "failure.json").write_text(json.dumps(dict(error=str(error), commands=commands, cases=cases, executions=executions), indent=2) + "\n")
    raise
