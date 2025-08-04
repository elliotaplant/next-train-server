#!/usr/bin/env python3
from PIL import Image, ImageDraw

# Create a simple train icon
size = 32
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Blue background circle
draw.ellipse([2, 2, size-2, size-2], fill='#007AFF')

# White train icon (simplified)
# Train body
draw.rectangle([8, 12, 24, 20], fill='white')
# Windows
draw.rectangle([10, 14, 13, 17], fill='#007AFF')
draw.rectangle([15, 14, 18, 17], fill='#007AFF')
draw.rectangle([20, 14, 23, 17], fill='#007AFF')
# Wheels
draw.ellipse([10, 19, 14, 23], fill='white')
draw.ellipse([18, 19, 22, 23], fill='white')

# Save favicon
img.save('/Users/elliot/code/personal/next-train-server/public/favicon.ico', format='ICO')
print("Created favicon.ico")