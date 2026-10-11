import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('single-file landing reveals, stays proportional and is accessible at each breakpoint',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/welcome');
  await expect(page.locator('html')).toHaveAttribute('data-ready','true',{timeout:10000});
  await expect(page.locator('.loader')).toHaveCount(0);
  expect(await page.locator('.landing').evaluate(el=>(el as HTMLElement).inert)).toBe(false);
  await expect(page.getByRole('heading',{name:'Own The Rally'})).toBeVisible();
  await expect(page.locator('#hero-title .word-mask>span').last()).toHaveCSS('opacity','1');
  for(const width of [360,640,768,1024,1440,1920,2560]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const visible=await page.locator('#hero-title').evaluate(el=>{
      const parent=el.closest('.hero')!.getBoundingClientRect();
      return [...el.querySelectorAll('.word-mask')].every(word=>word.getBoundingClientRect().right<=parent.right+1);
    });expect(visible,'Hero title is clipped at '+width).toBe(true);
  }
  await page.setViewportSize({width:1440,height:1000});
  expect((await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('.trust').scrollIntoViewIfNeeded();
  await expect(page.locator('.percent')).toHaveCSS('opacity','1');
  await expect(page.locator('.coach-wrap>[data-inview]')).toHaveCSS('opacity','1');
  await expect(page.locator('.ghost-title .word-mask>span').first()).toHaveCSS('opacity','1');
  for(const selector of ['.programs','.facilities','.stats','.testimonials','.footer'])await page.locator(selector).scrollIntoViewIfNeeded();
  await page.locator('.hero').scrollIntoViewIfNeeded();
  expect((await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.screenshot({path:'artifacts/landing-desktop.png',fullPage:true});
  await page.locator('.hero').screenshot({path:'artifacts/landing-hero.png'});
  await page.setViewportSize({width:360,height:800});
  await page.screenshot({path:'artifacts/landing-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('local entry validates a display name, enters the real workspace and supports guests without account requests',async({page})=>{
  const posts:string[]=[];page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await page.goto('/login');
  await expect(page).toHaveURL(/index\.html\?screen=login/);
  const name=page.getByRole('textbox',{name:'What should we call you?'});
  await expect(name).toBeFocused();
  await page.getByRole('button',{name:'Open my workspace'}).click();
  await expect(page.getByRole('alert')).toContainText('Enter a name');
  await expect(name).toHaveAttribute('aria-invalid','true');
  await name.fill('  Alex   Rivera  ');
  expect((await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.screenshot({path:'artifacts/login-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Open my workspace'}).click();
  await expect(page).toHaveURL('http://127.0.0.1:3000/workspace');
  await expect(page.getByRole('link',{name:'Local profile: Alex Rivera'})).toBeVisible();
  await page.goBack();await expect(page.getByRole('button',{name:'Open my workspace'})).toBeEnabled();
  await page.goto('/login');await expect(name).toHaveValue('Alex Rivera');
  for(const width of [320,360,640,768,1024,1440]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:360,height:800});
  await page.screenshot({path:'artifacts/login-mobile.png',fullPage:true});
  await page.getByRole('link',{name:'Continue as guest'}).click();
  await expect(page.getByRole('link',{name:'Local login',exact:true})).toBeVisible();
  expect(posts).toEqual([]);
});

test('menu, tips and both carousels work with keyboard, reduced motion and a failed CDN',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('https://cdn.jsdelivr.net/**',route=>route.abort());
  await page.goto('/index.html');
  await expect(page.locator('html')).toHaveAttribute('data-ready','true');
  await expect(page.locator('html')).toHaveAttribute('data-scroll-engine','native');
  await page.locator('#trust-next').click();
  await expect(page.locator('#coach-name')).toHaveText('Review the attempt');
  await page.locator('#trust-dots button').last().click();
  await expect(page.locator('#coach-name')).toHaveText('Take it into practice');
  await page.locator('#trust-prev').click();
  await expect(page.locator('#coach-name')).toHaveText('Review the attempt');
  await page.locator('#collection-dots button').nth(1).click();
  await expect(page.locator('#collection-brand')).toHaveText('Attempt Photo');
  await page.locator('#menu-open').click();
  await expect(page.locator('#menu-close')).toBeFocused();
  expect(await page.locator('html').evaluate(el=>el.style.overflow)).toBe('hidden');
  await page.getByRole('link',{name:'The evidence',exact:true}).click();
  await expect(page).toHaveURL(/#facilities$/);
  await expect(page.locator('#menu')).not.toHaveClass(/is-open/);
  expect(await page.locator('html').evaluate(el=>el.style.overflow)).toBe('');
  await page.getByRole('button',{name:'Recording tips',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Start with a clear court.'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Close recording tips'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('link',{name:'Open local entry'})).toBeFocused();
  expect((await new AxeBuilder({page}).analyze()).violations.map(v=>v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Recording tips',exact:true})).toBeFocused();
  expect(await page.locator('html').evaluate(el=>el.style.overflow)).toBe('');
});

test('blocked local storage still permits a guest to open the workspace',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}}));
  await page.goto('/login');
  await page.getByRole('textbox',{name:'What should we call you?'}).fill('Alex');
  await page.getByRole('button',{name:'Open my workspace'}).click();
  await expect(page.getByRole('status')).toContainText('cannot save your name');
  await page.getByRole('link',{name:'Continue as guest'}).click();
  await expect(page.getByRole('heading',{name:'Own your next rally.'})).toBeVisible();
});


test('front door leads through entry, upload and saved review back to the same workspace',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await expect(page).toHaveURL(/index\.html$/);
  await expect(page.getByRole('heading',{name:'Own The Rally'})).toBeVisible();
  await page.locator('.hero-cta').click();
  await expect(page.getByRole('textbox',{name:'What should we call you?'})).toBeVisible();
  await page.getByRole('link',{name:'Continue as guest'}).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await page.getByRole('button',{name:'Upload Match',exact:true}).click();
  await expect(page.getByLabel('Match video',{exact:true})).toBeAttached();
  await page.getByRole('button',{name:'Close upload'}).click();
  await page.getByRole('link',{name:'Open full review'}).click();
  const id=new URL(page.url()).pathname.split('/').pop();
  await expect(page.getByRole('heading',{name:'Your recording',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Back to Workspace'}).click();
  await expect(page).toHaveURL(new RegExp('/workspace\\?view=rallies&analysis='+id+'$'));
  await expect(page.getByRole('combobox',{name:'Recording',exact:true})).toHaveValue(id!);
  await page.getByRole('link',{name:'Website',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Own The Rally'})).toBeVisible();
});
