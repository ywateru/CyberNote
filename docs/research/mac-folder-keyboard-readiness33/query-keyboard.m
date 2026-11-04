#import <AppKit/AppKit.h>
#include <stdio.h>
int main(void) {
  @autoreleasepool {
    if (![NSThread isMainThread]) return 2;
    NSApplication *app = [NSApplication sharedApplication];
    NSUInteger windowsBefore = app.windows.count;
    BOOL activeBefore = app.active;
    BOOL keyboardNavigationEnabled = app.isFullKeyboardAccessEnabled;
    NSUInteger windowsAfter = app.windows.count;
    BOOL activeAfter = app.active;
    printf("{\"mainThread\":true,\"keyboardNavigationEnabled\":%s,\"windowsBefore\":%lu,\"windowsAfter\":%lu,\"activeBefore\":%s,\"activeAfter\":%s}\n",
      keyboardNavigationEnabled ? "true" : "false",
      (unsigned long)windowsBefore, (unsigned long)windowsAfter,
      activeBefore ? "true" : "false", activeAfter ? "true" : "false");
  }
  return 0;
}
