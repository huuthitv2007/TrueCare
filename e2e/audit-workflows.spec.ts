import { test, expect } from '@playwright/test';
import { emptyState } from '../server/domain';

test('admin delete reports blocked results and retries with the same request ID',async({page})=>{
  const state=emptyState('admin');
  state.products=[{id:'product-a',name:'Sản phẩm kiểm thử',code:'QA',group:'Giặt xả',brand:'TrueCare',variant:'Đỏ',unit:'can',pack:4,cost:'100',price:'110',effectiveDate:'2026-09-11'}];
  const keys:string[]=[];let blocked=true;
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/auth/session')return route.fulfill({json:{user:{id:'admin',username:'admin',email:'qa@local.test',displayName:'Kiểm thử',role:'admin',active:true}}});
    if(url.pathname==='/api/state')return route.fulfill({json:state});
    if(url.pathname==='/api/admin/products/bulk-actions'){
      const body=route.request().postDataJSON();keys.push(body.idempotencyKey);
      if(blocked)return route.fulfill({json:{successCount:0,skippedCount:1,results:[{id:'product-a',status:'skipped',message:'Dữ liệu đang bị khóa'}]}});
      if(keys.length===2)return route.abort('failed');
      state.products[0].archived=true;state.products[0].deletedAt='2026-09-11T00:00:00Z';
      return route.fulfill({json:{successCount:1,skippedCount:0,results:[{id:'product-a',status:'success',message:'Đã xóa'}]}});
    }
    return route.fulfill({json:{items:[],members:[]}});
  });
  await page.goto('/products');
  await page.getByRole('button',{name:'Xóa Sản phẩm kiểm thử'}).click();
  const modal=page.getByRole('dialog',{name:'Xóa sản phẩm'});
  await modal.getByLabel('Lý do quản trị').fill('Dọn dữ liệu thử');
  await modal.getByRole('button',{name:'Xóa',exact:true}).click();
  await expect(modal.getByRole('alert')).toContainText('Dữ liệu đang bị khóa');
  await expect(page.locator('.toast').filter({hasText:'Đã chuyển sản phẩm'})).toHaveCount(0);
  blocked=false;
  await modal.getByLabel('Lý do quản trị').fill('Dọn sau khi mở khóa');
  await modal.getByRole('button',{name:'Xóa',exact:true}).click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await modal.getByRole('button',{name:'Xóa',exact:true}).click();
  await expect(modal).toHaveCount(0);
  expect(keys[1]).toBe(keys[2]);
  expect(keys[0]).not.toBe(keys[1]);
  await expect(page.getByRole('button',{name:'Xóa Sản phẩm kiểm thử'})).toHaveCount(0);
});

test('employee cannot see delete actions; session expiry returns to login',async({page})=>{
  const state=emptyState('employee');let expired=false;
  state.products=[{id:'p',name:'Nước giặt',code:'QA',group:'Giặt xả',brand:'TrueCare',variant:'',unit:'can',pack:4,cost:'100',price:'110',effectiveDate:'2026-09-11'}];
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/session')return route.fulfill({json:{user:expired?null:{id:'employee',username:'qa',email:'qa@local.test',displayName:'Nhân viên',role:'employee',active:true}}});
    if(path==='/api/state')return route.fulfill({json:state});
    expired=true;return route.fulfill({status:401,json:{error:{code:'SESSION_EXPIRED',message:'Phiên hết hạn'}}});
  });
  await page.goto('/products');
  await expect(page.getByRole('heading',{name:'Sản phẩm & bảng giá'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Xóa Nước giặt/})).toHaveCount(0);
  await page.goto('/settings');
  await expect(page.getByRole('button',{name:/Đăng nhập/})).toBeVisible();
});

test('admin pagination waits for apply and retains filters after reload',async({page})=>{
  const state=emptyState('admin');const requests:string[]=[];
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/auth/session')return route.fulfill({json:{user:{id:'admin',role:'admin',active:true,displayName:'Quản trị',username:'qa',email:'qa@local.test'}}});
    if(url.pathname==='/api/state')return route.fulfill({json:state});
    if(url.pathname==='/api/admin/funds'){requests.push(url.search);return route.fulfill({json:{items:[],total:60,page:Number(url.searchParams.get('page'))}});}
    return route.fulfill({json:{items:[],members:[],total:0}});
  });
  await page.goto('/admin/funds');
  const card=page.getByRole('heading',{name:'Quỹ toàn đội'}).locator('..').locator('..').locator('..');
  await expect.poll(()=>requests.length).toBeGreaterThan(0);
  await expect(card.getByRole('status')).toHaveCount(0);
  const before=requests.length;
  await card.getByRole('textbox',{name:'Tìm kiếm…'}).fill('Khách thử');
  expect(requests.length).toBe(before);
  await card.getByRole('button',{name:'Áp dụng'}).click();
  await expect.poll(()=>requests.at(-1)).toContain('q=Kh');
  await page.reload();
  await expect(page.getByRole('textbox',{name:'Tìm kiếm…'}).first()).toHaveValue('Khách thử');
});
