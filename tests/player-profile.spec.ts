import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
const path=join(process.cwd(),'data/player/profile.json');
let previous:Buffer|null=null;
test.beforeAll(async()=>{try{previous=await readFile(path);}catch{}});
test.afterAll(async()=>{if(previous)await writeFile(path,previous);else await unlink(path).catch(()=>undefined);});
test('profile persists, consent withdrawal clears health, and deletion leaves review independent',async({page,request})=>{
  await page.goto('/workspace?view=profile');
  await page.getByLabel('Display name',{exact:true}).fill('Synthetic Player');
  await page.getByLabel('Age in years').fill('25');
  await page.getByLabel('I consent').check();
  await page.getByLabel('Current pain / injury').fill('Synthetic knee restriction');
  await page.getByRole('button',{name:'Save profile',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Profile saved');
  await page.reload();await expect(page.getByLabel('Current pain / injury')).toHaveValue('Synthetic knee restriction');
  await page.getByLabel('I consent').uncheck();await page.getByRole('button',{name:'Save profile',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Profile saved');
  const stored=await (await request.get('/api/profile')).json();expect(stored.profile.injuries).toBe('');expect(stored.profile.healthConsent).toBe(false);
  await page.getByRole('button',{name:'Delete profile'}).click();await expect(page.getByRole('status')).toContainText('Profile deleted');
  expect((await (await request.get('/api/profile')).json()).profile).toBeNull();
});
test('profile boundary rejects hostile origins, invalid fields and oversized data',async({request})=>{
  expect((await request.put('/api/profile',{data:{age:25}})).status()).toBe(403);
  expect((await request.put('/api/profile',{headers:{Origin:'https://example.com'},data:{age:25}})).status()).toBe(403);
  expect((await request.put('/api/profile',{headers:{Origin:process.env.PLAYWRIGHT_BASE_URL??'http://127.0.0.1:3000','Content-Type':'text/plain'},data:'{}'})).status()).toBe(400);
  for(const body of [{age:-1},{healthConsent:'yes'},{availableDays:['Monday','Monday']},{unexpected:'data'},{name:'x'.repeat(20000)}])
    expect((await request.put('/api/profile',{headers:{Origin:process.env.PLAYWRIGHT_BASE_URL??'http://127.0.0.1:3000'},data:body})).status()).toBe(400);
});
test('profile responsive, keyboard accessible and axe clean',async({page})=>{
  for(const width of [320,768,1024,1440]) {
    await page.setViewportSize({width,height:1000});await page.goto('/workspace?view=profile');
    await expect(page.getByRole('button',{name:'Save profile',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByLabel('Display name',{exact:true}).focus();await page.keyboard.press('Tab');await expect(page.getByLabel('Age in years')).toBeFocused();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:'artifacts/player-profile-desktop.png',fullPage:true});
});
test('failed profile reads cannot overwrite unseen saved details',async({page})=>{
  await page.route('**/api/profile',route=>route.fulfill({status:500,json:{error:'Profile could not be read.'}}));
  await page.goto('/workspace?view=profile');await expect(page.locator('.profile-panel').getByRole('alert')).toContainText('Reload to retry');
  await expect(page.getByRole('button',{name:'Save profile',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Random',exact:true})).toBeDisabled();
});
test('Random fills an editable valid sample without saving or consenting to health use',async({page,request})=>{
  const before=await (await request.get('/api/profile')).json();
  await page.goto('/workspace?view=profile');await page.getByLabel('I consent').check();
  await page.getByLabel('Current pain / injury').fill('Synthetic unsaved injury');
  await page.getByRole('button',{name:'Random',exact:true}).click();
  await expect(page.getByLabel('Display name',{exact:true})).toHaveValue(/^Sample /);
  await expect(page.getByLabel('Age in years')).toHaveValue(/^(1[89]|[23]\d|40)$/);
  await expect(page.getByLabel('I consent')).not.toBeChecked();
  await expect(page.getByLabel('Current pain / injury')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('not saved');
  expect(await (await request.get('/api/profile')).json()).toEqual(before);
  await page.getByLabel('Display name',{exact:true}).fill('Edited sample');
  await page.getByRole('button',{name:'Save profile',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Profile saved');
  const saved=(await (await request.get('/api/profile')).json()).profile;
  expect(saved.name).toBe('Edited sample');expect(saved.healthConsent).toBe(false);
  for(const key of ['conditions','injuries','restrictions'])expect(saved[key]).toBe('');
});
