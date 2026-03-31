import { TypeOrmModuleOptions } from '@nestjs/typeorm';

if (process.env.NODE_ENV === 'production') {
  for (const key of ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME']) {
    if (!process.env[key]) {
      throw new Error(
        `Missing required environment variable "${key}". ` +
          'All database credentials must be set explicitly in production.',
      );
    }
  }
}

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'greenleaf',
  password: process.env.DB_PASS || 'greenleaf_secret',
  database: process.env.DB_NAME || 'greenleaf_db',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
  migrationsRun: true,
};
