import {expect,test} from '@playwright/test';

test.describe('one-shot introduction (empty storage; not a device/app-data reset)',()=>{
  test.use({storageState:{cookies:[],origins:[]}});

  test('first launch shows IntroductionCopy and Continue reaches Library without resetting storage',async({page})=>{
    await page.goto('/');
    await expect(page.locator('[data-introduction-screen]')).toBeVisible();
    await expect(page.getByRole('heading',{name:'Introduction',exact:true})).toBeVisible();
    await expect(page.locator('[data-introduction="octave"]')).toContainText('octave');
    await expect(page.getByRole('heading',{name:'Library',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Library',exact:true})).toBeVisible();
    await expect(page.locator('[data-introduction-screen]')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading',{name:'Library',exact:true})).toBeVisible();
    await expect(page.locator('[data-introduction-screen]')).toHaveCount(0);
  });
});
