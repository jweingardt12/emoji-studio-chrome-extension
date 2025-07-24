const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// Icon sizes required for Chrome extensions
const sizes = [16, 32, 48, 128];

async function generateIcons() {
  // Path to the source logo
  const sourceLogo = '/Users/jason/Github/Emoji-Studio/public/logo-512.png';
  
  // Create icons directory if it doesn't exist
  const iconsDir = path.join(__dirname, 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
  }
  
  try {
    // Load the source image
    const image = await loadImage(sourceLogo);
    console.log(`Loaded source image: ${image.width}x${image.height}`);
    
    // Generate each icon size
    for (const size of sizes) {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');
      
      // Draw the image scaled to fit
      ctx.drawImage(image, 0, 0, size, size);
      
      // Save the icon
      const buffer = canvas.toBuffer('image/png');
      const outputPath = path.join(iconsDir, `icon${size}.png`);
      fs.writeFileSync(outputPath, buffer);
      
      console.log(`✓ Generated ${outputPath}`);
    }
    
    console.log('\n✅ All icons generated successfully!');
    console.log('Icons saved in:', iconsDir);
    
  } catch (error) {
    console.error('Error generating icons:', error);
    console.log('\nAlternative: Use an online tool like:');
    console.log('- https://redketchup.io/icon-resizer');
    console.log('- https://www.icoconverter.com/');
    console.log('\nOr use ImageMagick:');
    sizes.forEach(size => {
      console.log(`convert "${sourceLogo}" -resize ${size}x${size} "icons/icon${size}.png"`);
    });
  }
}

// Check if canvas is installed
try {
  require.resolve('canvas');
  generateIcons();
} catch (e) {
  console.log('Canvas module not found. Installing instructions:\n');
  console.log('npm install canvas\n');
  console.log('Or use ImageMagick commands:');
  console.log('brew install imagemagick\n');
  sizes.forEach(size => {
    console.log(`convert "/Users/jason/Github/Emoji-Studio/public/logo-512.png" -resize ${size}x${size} "icons/icon${size}.png"`);
  });
}