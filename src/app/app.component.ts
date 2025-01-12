import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OrgChartUploaderComponent } from './org-chart-uploader/org-chart-uploader.component';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

@Component({
  selector: 'app-root',
  imports: [OrgChartUploaderComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.sass'
})
export class AppComponent {
  title = 'OrgChartApp';
}
