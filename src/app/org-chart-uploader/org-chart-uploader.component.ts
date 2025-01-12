import { Component } from '@angular/core';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-org-chart-uploader',
  imports: [CommonModule],
  templateUrl: './org-chart-uploader.component.html',
  styleUrls: ['./org-chart-uploader.component.sass'],
})
export class OrgChartUploaderComponent {
  csvErrors: { row: number; message: string }[] = [];
  csvUploaded  = false;
  errorCategories: string[] = [
    'Only Admin will report to Root',
    'Managers can only report to other managers or admin',
    'Caller can only report to manager',
    'All users will report to 1 parent user at a time',
    'Missing data in row'
  ];

  // Map for role validation
  roleParentMap = {
    admin: ['root'],
    manager: ['manager', 'admin'],
    caller: ['manager']
  };

  // Store root's name and email
  rootName: string | null = null;
  rootEmail: string | null = null;

  ngOnInit() {
    // this.loadCsvData();
  }

  onFileChange(event: any): void {
    const file = event.target.files[0];
    if (file) {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();

      if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        this.csvUploaded = !this.csvUploaded;
        this.readExcelFile(file);
      } else if (fileExtension === 'csv') {
        this.csvUploaded = !this.csvUploaded;
        this.readCSVFile(file);
      } else {
        this.csvErrors = [
          { row: 0, message: 'Unsupported file format. Please upload an Excel or CSV file.' },
        ];
      }
    }
  }

  readExcelFile(file: File): void {
    const reader = new FileReader();

    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      this.validateHierarchy(jsonData);
    };

    reader.readAsArrayBuffer(file);
  }

  readCSVFile(file: File): void {
    const reader = new FileReader();

    reader.onload = (e: any) => {
      const csvData = e.target.result;

      Papa.parse(csvData, {
        complete: (result: any) => {
          const jsonData = result.data as any[];
          this.validateHierarchy(jsonData);
        },
        error: (err: any) => {
          this.csvErrors = [{ row: 0, message: `Error reading CSV: ${err.message}` }];
        },
      });
    };

    reader.readAsText(file);
  }

  validateHierarchy(data: any[]): void {
    this.csvErrors = []; // Clear previous errors
    const emailToRoleMap = new Map<string, string>();  // Maps email to role
    const emailToReportsToMap = new Map<string, string[]>();
    let rootEmail: string | null = null;
    let rootName: string | null = null;

    // Create maps for roles and reportsTo
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const [email, fullName, role, reportsTo] = row;

      if(role.toLowerCase() != 'root'){
      if (!email || !fullName || !role || !reportsTo) {
        this.csvErrors.push({ row: i + 1, message: 'Missing data in row.' });
        continue;
      }
      }

      emailToRoleMap.set(email, role.toLowerCase());
      emailToReportsToMap.set(email, reportsTo.split(';').map((x: string) => x.trim()));

      // Identify the Root user (ReportsTo should be empty)
      if (role.toLowerCase() === 'root' && reportsTo === '') {
        rootEmail = email;
        rootName = fullName;
      }
    }

    // Store root's name and email
    this.rootEmail = rootEmail;
    this.rootName = rootName;

    // Iterate over the data again to apply validation logic
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const [email, fullName, role, reportsTo] = row;
      const roleLower = role.toLowerCase();
      const reportToRoles = emailToReportsToMap.get(email) || [];

      if (!email || !fullName || !role || !reportsTo) {
        continue; // Skip already handled rows
      }

      // **Only Admin will report to Root** Rule:
      if (roleLower === 'admin' && email !== rootEmail && rootEmail && !reportToRoles.includes(rootEmail)) {
        this.csvErrors.push({
          row: i + 1,
          message: `'${email}' is an Admin but reports to someone other than Root (${reportsTo}). Admins should report to Root only.`,
        });
      }

      // **Manager cannot report to Root** Rule:
      if (roleLower === 'manager' && rootEmail && rootEmail && reportToRoles.includes(rootEmail)) {
        this.csvErrors.push({
          row: i + 1,
          message: `'${email}' is a Manager but reports to Root. Managers should report to other Managers or Admins.`,
        });
      }

      // Check for the **Caller can only report to Manager** rule
      if (roleLower === 'caller') {
        reportToRoles.forEach((reportToEmail) => {
          const reportToRole = emailToRoleMap.get(reportToEmail);
          // Validate Caller → Admin is not allowed
          if (reportToRole === 'admin') {
            this.csvErrors.push({
              row: i + 1,
              message: `'${email}' is a Caller but reports to Admin ('${reportToEmail}'). Callers can only report to Manager.`,
            });
          }

          // Validate Caller → Caller is not allowed
          if (reportToRole === 'caller') {
            this.csvErrors.push({
              row: i + 1,
              message: `'${email}' is a Caller but reports to another Caller ('${reportToEmail}'). Callers can only report to Manager.`,
            });
          }

          // Validate Caller → Root is not allowed
          if (reportToRole === 'root') {
            this.csvErrors.push({
              row: i + 1,
              message: `'${email}' is a Caller but reports to Root ('${reportToEmail}'). Callers can only report to Manager.`,
            });
          }
        });
      }

      // **All users will report to 1 parent user at a time**
      if (reportToRoles.length > 1) {
        this.csvErrors.push({
          row: i + 1,
          message: `'${email}' reports to multiple parents. Only one parent is allowed.`,
        });
      }
    }
  }


  getErrorsByCategory(category: string): { row: number; message: string }[] {
    switch (category) {
      case 'Only Admin will report to Root':
        return this.csvErrors.filter((error) => error.message.includes('Admin') && error.message.includes('Root'));
      case 'Managers can only report to other managers or admin':
        return this.csvErrors.filter((error) =>
          error.message.includes('Manager') && error.message.includes('report to')
        );
      case 'Caller can only report to manager':
        return this.csvErrors.filter((error) => error.message.includes('Caller') && error.message.includes('Manager'));
      case 'All users will report to 1 parent user at a time':
        return this.csvErrors.filter((error) => error.message.includes('multiple parents'));
        case 'Missing data in row':
        return this.csvErrors.filter((error) => error.message.includes('Missing data in row'));
      default:
        return []
    }
  }
}
