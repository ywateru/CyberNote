#import <AppKit/AppKit.h>
#include <stdint.h>

// Shared feedback for both toolbar icons/text and the formatting panel.
@interface NotesUIFeedbackButtonCell : NSButtonCell
@end
@interface NotesUIFeedbackButton : NSButton
@property BOOL notesHovered;
@property BOOL notesMenuOpen;
@property BOOL notesSelected;
@property CGFloat notesFeedbackScale;
- (NSString *)notesFeedbackState;
@end

// A fixed command and the state that produced this control. Never a host selector or script.
@interface NotesUIFormatButton : NotesUIFeedbackButton
@property NSString *notesCommand;
@property uint64_t notesRevision;
@end

NSDictionary<NSString *, NSDictionary *> *notesUIFormatEntries(NSArray *entries);
NSColor *notesUIFormatColor(NSString *command);
NSImage *notesUIFormatSwatch(NSString *command);
NSPopover *notesUIFormatPopover(NSDictionary<NSString *, NSDictionary *> *entries,
                               uint64_t revision, id target, SEL commandAction, SEL colorAction);
