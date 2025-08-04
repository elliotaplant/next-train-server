#!/usr/bin/env python3
from PIL import Image

# Open the AC Transit logo
img = Image.open('/Users/elliot/Downloads/actransit.png')
width, height = img.size

# Create a square canvas with white background
size = max(width, height)
square_img = Image.new('RGBA', (size, size), (255, 255, 255, 255))

# Calculate position to center the logo
x = (size - width) // 2
y = (size - height) // 2

# Paste the logo onto the square canvas
square_img.paste(img, (x, y), img if img.mode == 'RGBA' else None)

# Save the square version
square_img.save('/Users/elliot/code/personal/next-train-server/public/images/actransit.png')
print(f"Created square AC Transit logo: {size}x{size}")