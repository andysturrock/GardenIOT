#include "temperature_reading.hpp"
#include <ArduinoJson.h>

std::string TemperatureReading::toJson() const {
    
}

void TemperatureReading::fromJson(const std::string& json) {
StaticJsonDocument<512> doc;

  // Deserialize the JSON document
  DeserializationError error = deserializeJson(doc, file);
  if (error)
    Serial.println(F("Failed to read file, using default configuration"));
}