#include "u8g2_stream.hpp"

#include <U8g2lib.h>
#include <iostream>
#include <string>

#define   FONT_ONE_HEIGHT               8                                   // font one height in pixels
#define   FONT_TWO_HEIGHT               20                                  // font two height in pixels

using std::ostringstream;

U8G2Stream::U8G2Stream(U8G2& _u8g2) : u8g2(_u8g2) {
  LineBuffer lineBuffer;
  lineBuffers.push_back(lineBuffer);
}

void U8G2Stream::init() {
  u8g2.begin();
  u8g2.setFont(u8g2_font_6x10_tr);
  u8g2.setFontRefHeightExtendedText();
  u8g2.setDrawColor(1);
  u8g2.setFontPosTop();
  u8g2.setFontDirection(0);
  u8g2.clear();
}

U8G2Stream::~U8G2Stream() {
  std::cout << std::endl;
}

U8G2Stream& U8G2Stream::leftJustify() {
  lineBuffers.back().justification = U8G2Stream::Justification::LEFT;
  return *this;
}

U8G2Stream& U8G2Stream::rightJustify() {
  lineBuffers.back().justification = U8G2Stream::Justification::RIGHT;
  return *this;
}

U8G2Stream& U8G2Stream::centreJustify() {
  lineBuffers.back().justification = U8G2Stream::Justification::CENTRE;
  return *this;
}

U8G2Stream& U8G2Stream::clear() {
  u8g2.clear();
  return *this;
}

U8G2Stream& U8G2Stream::operator<<(const String& str) {
  lineBuffers.back().buffer += str.c_str();
  return *this;
}

U8G2Stream& U8G2Stream::operator<<(const char* str) {
  lineBuffers.back().buffer += str;
  return *this;
}

U8G2Stream& U8G2Stream::operator<<(int i) {
  ostringstream oss(lineBuffers.back().buffer);
  oss << i;
  lineBuffers.back().buffer = oss.str();
  return *this;
}

U8G2Stream& U8G2Stream::newline() {
  LineBuffer lineBuffer;
  lineBuffer.y = lineBuffers.size() * 11;
  lineBuffers.push_back(lineBuffer);
  return *this;
}

U8G2Stream& U8G2Stream::flush() {
  u8g2.clearBuffer();

  LineBuffersConstIterator citer = lineBuffers.begin(), end = lineBuffers.end();
  for(; citer != end; ++citer) {
    const char* str = citer->buffer.c_str();
    Serial.println(str);
    u8g2_uint_t x = 0;
    switch(citer->justification) {
      case Justification::CENTRE:
        x = 64 - (u8g2.getStrWidth(str) / 2);
        break;
      case Justification::RIGHT:
        x = 128 - u8g2.getStrWidth(str);
        break;
      case Justification::LEFT:
      default:
        x = 0;
    }
    u8g2.drawStr(x, citer->y, str);
  }
  u8g2.sendBuffer();

  lineBuffers.clear();
  LineBuffer lineBuffer;
  lineBuffers.push_back(lineBuffer);

  return *this;
}