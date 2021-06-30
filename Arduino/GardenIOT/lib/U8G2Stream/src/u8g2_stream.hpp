#ifndef U8G2STREAM_H
#define U8G2STREAM_H

#include <U8g2lib.h>
#include <string>
#include <ostream>
#include <sstream>
#include <list>

class U8G2Stream {
public:
  U8G2Stream(U8G2& u8g2);
  ~U8G2Stream();
  
  void init();

  U8G2Stream& flush();
  U8G2Stream& clear();
  // Allows something like:
  // display << "first line" << newline << "second line";
  // Note that this is not currently supported:
  // display << "firstline\n" << secondline;
  //
  // Not called endl as endl calls flush()
  U8G2Stream& newline();

  // Justification.
  // Applies to the current line
  U8G2Stream& leftJustify();
  U8G2Stream& rightJustify();
  U8G2Stream& centreJustify();

  U8G2Stream& operator<<(const char*);
  U8G2Stream& operator<<(int);
  U8G2Stream& operator<<(const String&);
  U8G2Stream& operator<<(U8G2Stream& (*__pf)(U8G2Stream&));

private:
  U8G2& u8g2;

  enum Justification {LEFT, RIGHT, CENTRE};
  
  struct LineBuffer {
    u8g2_uint_t y = 0;
    Justification justification = Justification::LEFT;
    std::string buffer;
  };

  std::list<LineBuffer> lineBuffers;
  typedef std::list<LineBuffer>::const_iterator LineBuffersConstIterator;
};

inline U8G2Stream& U8G2Stream::operator<<(U8G2Stream& (*__pf)(U8G2Stream&))
{
  return __pf(*this);
}

inline U8G2Stream& flush(U8G2Stream& display) {
  return display.flush();
}

inline U8G2Stream& clear(U8G2Stream& display) {
  return display.clear();
}

inline U8G2Stream& newline(U8G2Stream& display) {
  return display.newline();
}

inline U8G2Stream& leftJustify(U8G2Stream& display) {
  return display.leftJustify();
}

inline U8G2Stream& rightJustify(U8G2Stream& display) {
  return display.rightJustify();
}

inline U8G2Stream& centreJustify(U8G2Stream& display) {
  return display.centreJustify();
}

#endif // U8G2STREAM_H