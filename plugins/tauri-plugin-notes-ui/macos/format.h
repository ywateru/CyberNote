#import <AppKit/AppKit.h>
#include <stdint.h>

// A fixed command and the state that produced this control. Never a host selector or script.
@interface NotesUIFormatButton : NSButton
@property NSString *notesCommand;
@property uint64_t notesRevision;
@end

NSDictionary<NSString *, NSDictionary *> *notesUIFormatEntries(NSArray *entries);
NSColor *notesUIFormatColor(NSString *command);
NSImage *notesUIFormatSwatch(NSString *command);
NSPopover *notesUIFormatPopover(NSDictionary<NSString *, NSDictionary *> *entries,
                               uint64_t revision, id target, SEL commandAction, SEL colorAction);
