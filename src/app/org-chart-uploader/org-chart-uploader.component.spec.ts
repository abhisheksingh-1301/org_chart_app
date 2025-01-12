import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrgChartUploaderComponent } from './org-chart-uploader.component';

describe('OrgChartUploaderComponent', () => {
  let component: OrgChartUploaderComponent;
  let fixture: ComponentFixture<OrgChartUploaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrgChartUploaderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OrgChartUploaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
