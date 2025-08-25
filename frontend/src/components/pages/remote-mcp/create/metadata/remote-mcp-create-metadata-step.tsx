import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../../redpanda-ui/components/badge';
import { Button } from '../../../../redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../redpanda-ui/components/card';
import { Input } from '../../../../redpanda-ui/components/input';
import { Label } from '../../../../redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../redpanda-ui/components/select';
import { Textarea } from '../../../../redpanda-ui/components/textarea';

interface MetadataStepProps {
  displayName: string;
  setDisplayName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  tags: Array<{ key: string; value: string }>;
  setTags: (tags: Array<{ key: string; value: string }>) => void;
  resources: string;
  setResources: (value: string) => void;
}

export const RemoteMCPCreateMetadataStep = ({
  displayName,
  setDisplayName,
  description,
  setDescription,
  tags,
  setTags,
  resources,
  setResources,
}: MetadataStepProps) => {
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagValue, setNewTagValue] = useState('');

  const addTag = () => {
    if (newTagKey && newTagValue) {
      setTags([...tags, { key: newTagKey, value: newTagValue }]);
      setNewTagKey('');
      setNewTagValue('');
    }
  };

  const removeTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  return (
    <Card className="max-w-full">
      <CardHeader>
        <CardTitle>Server Metadata</CardTitle>
        <CardDescription>Configure the basic information and resources for your MCP server.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name *</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My MCP Server"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this MCP server does..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Key"
              value={newTagKey}
              onChange={(e) => setNewTagKey(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Value"
              value={newTagValue}
              onChange={(e) => setNewTagValue(e.target.value)}
              className="flex-1"
            />
            <Button onClick={addTag} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, index) => (
              <Badge key={`${tag.key}-${tag.value}-${index}`} variant="secondary" className="gap-1">
                {tag.key}: {tag.value}
                <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag(index)} />
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="resources">Resources</Label>
          <Select value={resources} onValueChange={setResources}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small (0.5 CPU, 1GB RAM)</SelectItem>
              <SelectItem value="medium">Medium (1 CPU, 2GB RAM)</SelectItem>
              <SelectItem value="large">Large (2 CPU, 4GB RAM)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};
