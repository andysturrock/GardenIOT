#ifndef U8G2DISPLAY_H
#define U8G2DISPLAY_H

#include <U8g2lib.h>
#include <string>
#include <ostream>
#include <sstream>

class U8G2Display {
public:
  U8G2Display(U8G2& u8g2);
  ~U8G2Display();
  
  void init();

  U8G2Display& flush();
  U8G2Display& clear();
  // Allows something like:
  // display << "first line" << nextline << "second line";
  U8G2Display& nextline();

  // Justification.
  // Applies to the display as a whole,
  // not to each item added via the insertion operators below.
  U8G2Display& leftJustify();
  U8G2Display& rightJustify();
  U8G2Display& centreJustify();

  U8G2Display& operator<<(const char*);
  U8G2Display& operator<<(int);
  U8G2Display& operator<<(U8G2Display& (*__pf)(U8G2Display&));

private:
  U8G2& u8g2;
  std::ostringstream buffer;
  enum Justification {LEFT, RIGHT, CENTRE};
  Justification justification;
};

inline U8G2Display& U8G2Display::operator<<(U8G2Display& (*__pf)(U8G2Display&))
{
  return __pf(*this);
}

inline U8G2Display& flush(U8G2Display& display) {
  return display.flush();
}

inline U8G2Display& clear(U8G2Display& display) {
  return display.clear();
}

#endif // U8G2DISPLAY_H