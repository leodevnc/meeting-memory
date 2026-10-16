const {test,expect}=require('@playwright/test');
test('local upload, record review and action completion remain usable',async({page})=>{
  const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')external.push(r.url());});
  await page.goto('/');
  await expect(page.locator('#modeNote')).toContainText('고정 전사 샘플');
  await expect(page.locator('#submit')).toBeDisabled();
  await page.screenshot({path:'docs/workspace.png',fullPage:true});
  await page.getByRole('button',{name:'파일',exact:true}).click();
  await expect(page.locator('#fileTab')).toHaveAttribute('aria-pressed','true');
  await page.locator('#file').setInputFiles({name:'synthetic-meeting.webm',mimeType:'audio/webm',buffer:Buffer.from('synthetic audio test fixture')});
  await expect(page.locator('#submit')).toBeEnabled();
  await page.locator('#submit').click();
  await expect(page.locator('#notice')).toContainText('처리를 시작');
  await expect.poll(async()=>{await page.locator('#refresh').click();return page.locator('#meetings').innerText();}).toContain('READY');
  await page.locator('.meeting').first().click();
  await expect(page.locator('#detail .status')).toHaveText('READY');
  await expect(page.locator('#detail h1')).toBeVisible();
  const action=page.locator('[data-action]').first();
  await action.check();
  await expect(page.locator('.action.done')).toHaveCount(1);
  await page.getByText('전체 전사 보기',{exact:true}).click();
  await expect(page.locator('#detail pre')).toContainText('speaker_0');
  await page.screenshot({path:'docs/meeting-detail.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'docs/workspace-mobile.png',fullPage:true});
  expect(errors).toEqual([]);expect(external).toEqual([]);
});
test('neutral theme supports narrow screens and keyboard entry',async({page})=>{
  await page.goto('/');
  await page.keyboard.press('Tab');await expect(page.locator(':focus')).toHaveText('본문으로 건너뛰기');
  await page.keyboard.press('Enter');await expect(page.locator('#main')).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(255, 255, 255)');
  for(const width of [320,768,1440]){
    await page.setViewportSize({width,height:1000});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#fileTab').click();await expect(page.locator('#filePanel')).toBeVisible();
    await page.locator('#recordTab').click();await expect(page.locator('#recordPanel')).toBeVisible();
  }
});
