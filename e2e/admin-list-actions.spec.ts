import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAdminLists } from "./admin-list-fixture";

test('admin confirms stock, fund and shared archive actions from visible row buttons',async({page})=>{
  const fixture=await mockAdminLists(page);
  await page.goto('/admin/inventory');
  const row=page.getByRole('row').filter({hasText:'Hàng hết kinh doanh'});
  await row.evaluate(element=>window.scrollBy(0,element.getBoundingClientRect().top-window.innerHeight/2));
  await expect(row.getByRole('button',{name:'Xóa',exact:true})).toBeInViewport();
  await row.getByRole('button',{name:'Xóa',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('12 → 0');
  await dialog.getByRole('button',{name:'Điều chỉnh tồn về 0',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('ít nhất 3');
  await dialog.getByLabel('Lý do quản trị').fill('Dọn tồn thử nghiệm');
  await dialog.getByRole('button',{name:'Điều chỉnh tồn về 0',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(row.getByRole('button',{name:'Xóa',exact:true})).toBeDisabled();
  await page.goto('/admin/funds');
  await page.getByRole('row').filter({hasText:'Quỹ nhập tay kiểm thử'}).getByRole('button',{name:'Xóa',exact:true}).click();
  await dialog.getByLabel('Lý do quản trị').fill('Bù trừ thử nghiệm');
  await dialog.getByRole('button',{name:'Tạo bút toán bù trừ',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.getState().ledger.filter(row=>row.reversalOf)).toHaveLength(1);
  const programs=page.getByRole('row').filter({hasText:'Chương trình kiểm thử'});
  await programs.getByRole('button',{name:'Xóa',exact:true}).click();
  await dialog.getByLabel('Lý do quản trị').fill('Lưu chương trình cũ');
  await dialog.getByRole('button',{name:'Hủy và lưu trữ',exact:true}).click();
  await expect(programs).toHaveCount(0);
  await page.getByLabel('Lưu trữ',{exact:true}).selectOption('archived');
  await page.getByRole('button',{name:'Áp dụng',exact:true}).last().click();
  await programs.getByRole('button',{name:'Khôi phục hiển thị'}).click();
  await dialog.getByLabel('Lý do quản trị').fill('Xem lại chương trình');
  await dialog.getByRole('button',{name:'Khôi phục hiển thị',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.getState().programs[0].status).toBe('cancelled');
  for(const path of ['imports','audit']){
    await page.goto(`/admin/${path}`);
    await page.locator('tbody').getByRole('button',{name:'Xóa',exact:true}).click();
    await expect(dialog).toContainText('tất cả admin');
    await dialog.getByLabel('Lý do quản trị').fill('Lưu trữ lịch sử thử');
    await dialog.getByRole('button',{name:'Lưu trữ',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    await page.getByLabel('Lưu trữ',{exact:true}).selectOption('archived');
    await page.getByRole('button',{name:'Áp dụng',exact:true}).click();
    await expect(page.locator('tbody').getByRole('button',{name:'Khôi phục hiển thị'})).toBeVisible();
  }
});

test('bulk toolbar, inline reason, keyboard focus and sticky actions remain accessible',async({page})=>{
  await mockAdminLists(page);await page.goto('/admin/customers');
  const toolbar=page.getByRole('region',{name:'Thao tác các dòng đã chọn'});
  await expect(toolbar.getByRole('button',{name:'Xóa',exact:true})).toBeDisabled();
  const scroller=page.getByRole('region',{name:'Bảng dữ liệu có thể cuộn'});
  const button=page.locator('tbody tr').first().getByRole('button',{name:'Xóa',exact:true});
  await button.evaluate(element=>window.scrollBy(0,element.getBoundingClientRect().top-window.innerHeight/2));
  await expect(button).toBeInViewport();
  await scroller.evaluate(element=>{element.scrollLeft=element.scrollWidth;});
  await expect(button).toBeInViewport();
  await button.click();await expect(page.getByRole('dialog').getByLabel('Lý do quản trị')).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(button).toBeFocused();
  const results=await new AxeBuilder({page}).include('#workspace-content').analyze();
  expect(results.violations).toEqual([]);
});

test('catalog delete confirms and saves immediately without a global reason',async({page})=>{
  const fixture=await mockAdminLists(page);await page.goto('/admin/catalogs');
  const first=page.locator('.catalog-row').first();const value=await first.locator('strong').textContent();
  await first.getByRole('button',{name:'Xóa',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Xóa mục danh mục'});
  await dialog.getByLabel('Lý do quản trị').fill('Dọn mục chưa dùng');
  await dialog.getByRole('button',{name:'Xóa mục',exact:true}).click();
  await expect(dialog).toHaveCount(0);expect(fixture.getState().catalogs!.districts).not.toContain(value);
});
