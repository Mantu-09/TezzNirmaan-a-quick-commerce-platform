const playwright = require('playwright');
(async () => {
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3001');
  console.log('Page loaded');
  await page.waitForTimeout(2000);
  
  // click location selector in MarketingNav
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const locBtn = btns.find(b => b.innerText && (b.innerText.includes('Delivery in') || b.innerText.includes('Select Location')));
    if (locBtn) locBtn.click();
  });
  
  await page.waitForTimeout(1000);
  console.log('Modal opened');
  
  const inputs = await page.$$('input');
  for (let input of inputs) {
     const ph = await input.getAttribute('placeholder');
     if (ph && ph.includes('Search delivery location')) {
        await input.fill('hardaspur, punjab');
        console.log('Typed search');
     }
  }
  
  await page.waitForTimeout(3000);
  
  const html = await page.content();
  if (html.includes('Hardaspur')) {
    console.log('Suggestion found in DOM!');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const sugBtn = btns.find(b => b.innerText && b.innerText.includes('Hardaspur'));
      if (sugBtn) sugBtn.click();
    });
    
    await page.waitForTimeout(1000);
    const htmlAfter = await page.content();
    if (htmlAfter.includes('Oops!')) {
      console.log('Oops screen is visible!');
    } else {
      console.log('Oops screen NOT visible!');
      if (!htmlAfter.includes('AVAILABLE CITIES') && !htmlAfter.includes('Detect my location')) {
         console.log('Modal is closed!');
      } else {
         console.log('Modal is still open, but no oops.');
      }
    }
  } else {
    console.log('Suggestion not found in DOM.');
  }
  
  await browser.close();
})();
