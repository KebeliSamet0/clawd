#!/bin/bash
echo "Animasyon asset'leri indiriliyor..."
git clone --depth=1 https://github.com/rullerzhou-afk/clawd-on-desk.git _temp_clawd
cp -r _temp_clawd/assets/svg-animations ./assets/svg-animations
cp _temp_clawd/assets/LICENSE ./assets/LICENSE-clawd
rm -rf _temp_clawd
echo "Tamam! assets/svg-animations/ klasörü hazır."
