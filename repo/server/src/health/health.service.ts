import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<{ status: string; db: boolean }> {
    let dbHealthy = false;
    try {
      await this.dataSource.query('SELECT 1');
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }
    return { status: 'ok', db: dbHealthy };
  }
}
