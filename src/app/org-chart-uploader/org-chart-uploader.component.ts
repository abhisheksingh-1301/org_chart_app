import { Component } from '@angular/core';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-org-chart-uploader',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './org-chart-uploader.component.html',
  styleUrls: ['./org-chart-uploader.component.sass'],
})
export class OrgChartUploaderComponent {
  csvErrors: { row: number; message: string }[] = [];
  csvUploaded = false;
  errorCategories: string[] = [
    'Hierarchy contains a cycle',
    'Only Admin will report to Root',
    'Managers can only report to other managers or admin',
    'Caller can only report to manager',
    'All users will report to 1 parent user at a time',
    'Missing data in row',
  ];

  // Map for role validation
  roleParentMap = {
    admin: ['root'],
    manager: ['manager', 'admin'],
    caller: ['manager'],
  };

  // Store root's name and email
  rootName: string | null = null;
  rootEmail: string | null = null;

  ngOnInit() {}

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
    const emailToRoleMap = new Map<string, string>(); // Maps email to role
    const emailToReportsToMap = new Map<string, string[]>();
    const graph = new Map<string, string[]>(); // Graph representation for cycle detection
    let rootEmail: string | null = null;
    let rootName: string | null = null;

    // Build maps and graph
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const [email, fullName, role, reportsTo] = row;

      if (!email || !fullName || !role || (!reportsTo && role.toLowerCase() !== 'root')) {
        this.csvErrors.push({ row: i + 1, message: 'Missing data in row.' });
        continue;
      }

      emailToRoleMap.set(email, role.toLowerCase());
      emailToReportsToMap.set(email, reportsTo.split(';').map((x: string) => x.trim()));

      // Populate graph for cycle detection
      if (!graph.has(email)) graph.set(email, []);
      reportsTo.split(';').forEach((parent: string) => {
        const trimmedParent = parent.trim();
        if (trimmedParent) {
          if (!graph.has(trimmedParent)) graph.set(trimmedParent, []);
          graph.get(trimmedParent)?.push(email); // Reverse the edge direction for validation
        }
      });

      // Identify the Root user
      if (role.toLowerCase() === 'root' && reportsTo === '') {
        rootEmail = email;
        rootName = fullName;
      }
    }

    // Store root's name and email
    this.rootEmail = rootEmail;
    this.rootName = rootName;

    // Detect cycles in the graph
    const cyclePath = this.detectCycle(graph, emailToRoleMap);
    if (cyclePath) {
      this.csvErrors.push({
      row: data.findIndex(row => row.includes(cyclePath[0])) + 1,
      message: `Hierarchy contains a cycle involving: ${cyclePath.join(' -> ')}`,
      });
     // return;
    }

    // Validate other rules
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
      if (roleLower === 'manager' && rootEmail && reportToRoles.includes(rootEmail)) {
        this.csvErrors.push({
          row: i + 1,
          message: `'${email}' is a Manager but reports to Root. Managers should report to other Managers or Admins.`,
        });
      }

      // **Caller can only report to Manager** Rule:
      if (roleLower === 'caller') {
        reportToRoles.forEach((reportToEmail) => {
          const reportToRole = emailToRoleMap.get(reportToEmail);
          if (reportToRole !== 'manager') {
            this.csvErrors.push({
              row: i + 1,
              message: `'${email}' is a Caller but reports to '${reportToRole}' ('${reportToEmail}'). Callers can only report to Manager.`,
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

  detectCycle(graph: Map<string, string[]>, emailToRoleMap: Map<string, string>): string[] | null {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (node: string, path: string[]): boolean => {
      if (stack.has(node)) {
        path.push(node);
        return true; // Cycle detected
      }

      if (visited.has(node)) return false; // Already processed

      visited.add(node);
      stack.add(node);
      path.push(node);

      for (const neighbor of graph.get(node) || []) {
        if (emailToRoleMap.get(neighbor) === 'caller' && stack.has(node)) {
          path.push(neighbor);
          return true; // Detect indirect cycle involving caller
        }

        if (dfs(neighbor, path)) return true;
      }

      stack.delete(node);
      path.pop();
      return false;
    };

    for (const node of graph.keys()) {
      const path: string[] = [];
      if (!visited.has(node) && dfs(node, path)) {
        path.push(path[0]); // Complete the cycle for clarity
        return path.reverse();
      }
    }

    return null;
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
      case 'Hierarchy contains a cycle':
        return this.csvErrors.filter((error) => error.message.includes('Hierarchy contains a cycle'));
      default:
        return [];
    }
  }
}
