#include "temperature_reading.hpp"
#include <ArduinoJson.h>

std::string TemperatureReading::toJson() const {
  // 512 computed from arduinojson.org/v6/assistant
  StaticJsonDocument<512> doc;
  doc["sensor_id"] = sensor_id;
  doc["temperature"] = temperature;
  std::string json;
  serializeJson(doc, json);
  return json;
}
