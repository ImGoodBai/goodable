const PptxGenJS = require('pptxgenjs');

// Create a new presentation
const pptx = new PptxGenJS();

// Slide 1: Title slide
const slide1 = pptx.addSlide();
slide1.addText('Hello World', {
  x: 1,
  y: 2.5,
  w: 8,
  h: 1.5,
  fontSize: 44,
  bold: true,
  align: 'center',
  color: '363636'
});

// Slide 2: Simple message
const slide2 = pptx.addSlide();
slide2.addText('This is a test presentation', {
  x: 1,
  y: 2.5,
  w: 8,
  h: 1,
  fontSize: 32,
  align: 'center',
  color: '363636'
});

// Save the presentation
pptx.writeFile({ fileName: './hello.pptx' })
  .then(() => {
    console.log('PowerPoint presentation created successfully: hello.pptx');
  })
  .catch(err => {
    console.error('Error creating presentation:', err);
    process.exit(1);
  });
