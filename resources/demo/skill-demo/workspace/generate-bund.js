const pptxgen = require('pptxgenjs');
const html2pptx = require('/Users/good/Downloads/goodable/skill-demo/skills-plugin/skills/pptx/scripts/html2pptx.js');

async function createPresentation() {
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'Claude';
    pptx.title = '上海外滩';

    await html2pptx('/Users/good/Downloads/goodable/skill-demo/workspace/slide1.html', pptx);
    await html2pptx('/Users/good/Downloads/goodable/skill-demo/workspace/slide2.html', pptx);
    await html2pptx('/Users/good/Downloads/goodable/skill-demo/workspace/slide3.html', pptx);

    await pptx.writeFile({ fileName: '/Users/good/Downloads/goodable/skill-demo/output/ppt-1768553744041.pptx' });
    console.log('Presentation created successfully!');
}

createPresentation().catch(console.error);
