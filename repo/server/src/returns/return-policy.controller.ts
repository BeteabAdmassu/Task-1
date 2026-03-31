import { Controller, Get, Patch, Body } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ReturnsService } from './returns.service';
import { UpdateReturnPolicyDto } from './dto/update-return-policy.dto';

@Controller('admin/return-policy')
@Roles(Role.ADMINISTRATOR)
export class ReturnPolicyController {
  constructor(private readonly service: ReturnsService) {}

  @Get()
  getPolicy() {
    return this.service.getPolicy();
  }

  @Patch()
  updatePolicy(@Body() dto: UpdateReturnPolicyDto) {
    return this.service.updatePolicy(dto);
  }
}
