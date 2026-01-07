/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from '../../redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../redpanda-ui/components/card';
import { Separator } from '../../redpanda-ui/components/separator';
import { Text } from '../../redpanda-ui/components/typography';

type UserInformationCardProps = {
  username: string;
  onEditPassword?: () => void;
};

export const UserInformationCard = ({ username, onEditPassword }: UserInformationCardProps) => {
  return (
    <Card size="full">
      <CardHeader>
        <CardTitle>User information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Username Row */}
        <div className="grid grid-cols-3 items-center gap-4 py-2">
          <Text variant="label">Username</Text>
          <Text variant="default">{username}</Text>
        </div>

        <Separator />

        {/* Password Row */}
        <div className="grid grid-cols-3 items-center gap-4 py-2">
          <Text variant="label">Password</Text>
          <Text variant="muted">Passwords cannot be viewed</Text>
          <div className="flex justify-end">
            {Boolean(onEditPassword) && (
              <Button onClick={onEditPassword} size="sm" variant="outline">
                Edit
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
